package com.iflytek.skillhub.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.iflytek.skillhub.config.SkillPublishProperties;
import com.iflytek.skillhub.controller.support.SkillPackageArchiveExtractor;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.skill.validation.PackageEntry;
import com.iflytek.skillhub.domain.skill.validation.SkillPackagePolicy;

import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/** Resolves bytes only. External code goes through the same validation and review as local uploads. */
@Service
public class ExternalSkillPackageService {
    private static final int MAX_DOWNLOAD = 20 * 1024 * 1024;
    private static final int MAX_EXPANDED = 32 * 1024 * 1024;
    private static final int TIMEOUT_MS = 10_000;
    private static final Set<String> DOWNLOAD_HOSTS = Set.of(
            "codeload.github.com", "clawhub.ai", "api.skillhub.cn",
            "skillhub-1388575217.cos.accelerate.myqcloud.com",
            "skillhub-1388575217.cos.ap-guangzhou.myqcloud.com");
    private static final Pattern COMMIT = Pattern.compile("[0-9a-fA-F]{40}");

    public record Resolved(String sourceUrl, byte[] zip, List<PackageEntry> entries) {}

    private final SkillPackageArchiveExtractor extractor;
    private final SkillPackagePreviewService preview;
    private final SkillPublishProperties limits;
    private final ObjectMapper json;

    public ExternalSkillPackageService(SkillPackageArchiveExtractor extractor, SkillPackagePreviewService preview,
                                       SkillPublishProperties limits, ObjectMapper json) {
        this.extractor = extractor;
        this.preview = preview;
        this.limits = limits;
        this.json = json;
    }

    public Resolved resolve(String url) {
        ExternalSkillLink link = ExternalSkillLink.parse(url);
        try {
            byte[] bytes = download(link.download());
            if (!link.githubArchive() && "clawhub.ai".equals(link.download().getHost())
                    && !(bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K')) {
                link = resolveClawHubHandoff(link, bytes);
                bytes = download(link.download());
            }
            byte[] zip = link.githubArchive() ? selectGithubDirectory(bytes, link) : bytes;
            var extracted = extractor.extractWithWarnings(zip, MAX_EXPANDED);
            if (!extracted.warnings().isEmpty()) {
                throw new DomainBadRequestException("error.skill.external.directory");
            }
            var metadata = preview.preview(extracted.entries());
            if (link.skillName() != null && !link.skillName().equalsIgnoreCase(metadata.name())) {
                throw new DomainBadRequestException("error.skill.external.directory");
            }
            return new Resolved(link.page().toString(), zip, extracted.entries());
        } catch (IllegalArgumentException ex) {
            throw new DomainBadRequestException("error.skill.publish.package.invalid", ex.getMessage());
        } catch (IOException ex) {
            throw new DomainBadRequestException("error.skill.external.download");
        }
    }

    public String verify(String url, List<PackageEntry> submitted) {
        Resolved resolved = resolve(url);
        var sorted = Comparator.comparing(PackageEntry::path);
        var expected = resolved.entries().stream().sorted(sorted).toList();
        var actual = submitted.stream().sorted(sorted).toList();
        if (expected.size() != actual.size()) throw changed();
        for (int i = 0; i < expected.size(); i++) {
            if (!expected.get(i).path().equals(actual.get(i).path())
                    || !MessageDigest.isEqual(expected.get(i).content(), actual.get(i).content())) throw changed();
        }
        return resolved.sourceUrl();
    }

    private static DomainBadRequestException changed() {
        return new DomainBadRequestException("error.skill.external.changed");
    }

    private ExternalSkillLink resolveClawHubHandoff(ExternalSkillLink link, byte[] bytes) throws IOException {
        if (bytes.length > 64 * 1024) throw new IOException("Invalid source handoff size");
        var handoff = json.readTree(bytes);
        String[] repo = handoff.path("repo").asText().split("/", -1);
        String commit = handoff.path("commit").asText();
        if (!"public-github".equals(handoff.path("sourceRef").asText()) || repo.length != 2 || !COMMIT.matcher(commit).matches()) {
            throw new IOException("No hosted package");
        }
        String directory = handoff.path("path").asText();
        if (directory.endsWith("/SKILL.md")) directory = directory.substring(0, directory.length() - 9);
        else if (directory.equals("SKILL.md")) directory = "";
        else if (!directory.isEmpty() && !SkillPackagePolicy.normalizeEntryPath(directory).equals(directory)) {
            throw new IOException("Invalid source path");
        }
        return ExternalSkillLink.github(link.page(), repo[0], repo[1], commit, directory, null);
    }

    byte[] download(URI address) throws IOException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TIMEOUT_MS);
        for (int redirects = 0; redirects <= 3; redirects++) {
            if (!"https".equals(address.getScheme()) || !DOWNLOAD_HOSTS.contains(address.getHost())
                    || address.getUserInfo() != null || address.getPort() != -1) {
                throw new IOException("Unexpected download address");
            }
            if (System.nanoTime() >= deadline) throw new IOException("External download timed out");
            int timeout = (int) Math.max(1, TimeUnit.NANOSECONDS.toMillis(deadline - System.nanoTime()));
            HttpURLConnection connection = (HttpURLConnection) address.toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(timeout);
            connection.setReadTimeout(timeout);
            connection.setRequestProperty("User-Agent", "Luma-Skill-Hub/1.0");
            try {
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String target = connection.getHeaderField("Location");
                    if (target == null) throw new IOException("Missing download address");
                    address = address.resolve(target);
                    continue;
                }
                if (status != 200) throw new IOException("External download failed");
                if (connection.getContentLengthLong() > MAX_DOWNLOAD) throw tooLarge();
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] buffer = new byte[8192];
                    for (int length; (length = input.read(buffer)) != -1; ) {
                        if (System.nanoTime() > deadline) throw new IOException("External download timed out");
                        if (output.size() + length > MAX_DOWNLOAD) throw tooLarge();
                        output.write(buffer, 0, length);
                    }
                    return output.toByteArray();
                }
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException("Too many download redirects");
    }

    private byte[] selectGithubDirectory(byte[] archive, ExternalSkillLink link) throws IOException {
        Path temporary = Files.createTempFile("luma-external-", ".zip");
        try {
            Files.write(temporary, archive);
            try (ZipFile origin = new ZipFile(temporary.toFile())) {
                var files = origin.stream().filter(entry -> !entry.isDirectory()).toList();
                String directory = selectDirectory(files, link);
                var selected = files.stream().filter(entry -> entry.getName().startsWith(directory)).toList();
                if (selected.size() > limits.getMaxFileCount()) throw tooLarge();
                return repackage(origin, selected, directory);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static String selectDirectory(List<? extends ZipEntry> files, ExternalSkillLink link) {
        var roots = files.stream().map(ZipEntry::getName).filter(path -> path.indexOf('/') > 0)
                .map(path -> path.substring(0, path.indexOf('/') + 1)).distinct().toList();
        if (roots.size() != 1) throw new DomainBadRequestException("error.skill.external.directory");
        String root = roots.getFirst();
        var candidates = files.stream().map(ZipEntry::getName)
                .filter(path -> path.startsWith(root) && path.toUpperCase(java.util.Locale.ROOT).endsWith("/SKILL.MD"))
                .map(path -> path.substring(0, path.lastIndexOf('/') + 1)).distinct().toList();
        if (link.directory() != null) {
            String selected = link.directory().isBlank() ? root : root + link.directory() + "/";
            if (candidates.contains(selected)) return selected;
        } else if (link.skillName() != null) {
            var matches = candidates.stream().filter(path -> path.endsWith("/" + link.skillName() + "/")).toList();
            if (matches.size() == 1) return matches.getFirst();
            if (matches.isEmpty() && candidates.size() == 1 && candidates.contains(root)) return root;
        } else {
            if (candidates.contains(root)) return root;
            if (candidates.size() == 1) return candidates.getFirst();
        }
        throw new DomainBadRequestException("error.skill.external.directory");
    }

    private byte[] repackage(ZipFile origin, List<? extends ZipEntry> selected, String directory) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        long expanded = 0;
        try (ZipOutputStream result = new ZipOutputStream(bytes)) {
            byte[] buffer = new byte[8192];
            for (ZipEntry entry : selected) {
                String path = SkillPackagePolicy.normalizeEntryPath(entry.getName().substring(directory.length()));
                result.putNextEntry(new ZipEntry(path));
                try (InputStream source = origin.getInputStream(entry)) {
                    long fileSize = 0;
                    for (int count; (count = source.read(buffer)) != -1; ) {
                        fileSize += count;
                        expanded += count;
                        if (fileSize > limits.getMaxSingleFileSize() || expanded > Math.min(limits.getMaxPackageSize(), MAX_EXPANDED)) throw tooLarge();
                        result.write(buffer, 0, count);
                    }
                }
                result.closeEntry();
            }
        }
        if (bytes.size() > MAX_DOWNLOAD) throw tooLarge();
        return bytes.toByteArray();
    }

    private static DomainBadRequestException tooLarge() {
        return new DomainBadRequestException("error.skill.external.tooLarge");
    }
}
