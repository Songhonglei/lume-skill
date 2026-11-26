package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;

import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Provider addresses are constructed from validated coordinates, never fetched as entered. */
record ExternalSkillLink(URI page, URI download, boolean githubArchive, String directory, String skillName) {
    private static final Pattern SEGMENT = Pattern.compile("[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}");
    private static final Pattern DIRECTORY_SEGMENT = Pattern.compile("[a-zA-Z0-9_.-]{1,100}");
    private static final Pattern VERSION = Pattern.compile("[a-zA-Z0-9][a-zA-Z0-9.+_-]{0,63}");

    static ExternalSkillLink parse(String input) {
        if (input == null || input.length() > 2048) throw invalid();
        final URI uri;
        try {
            uri = URI.create(input.strip());
        } catch (IllegalArgumentException ex) {
            throw invalid();
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                || uri.getUserInfo() != null || uri.getPort() != -1 || uri.getPath() == null) {
            throw invalid();
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        String path = uri.getPath().replaceFirst("/$", "");
        if (!path.startsWith("/") || uri.getRawPath().contains("%")) throw invalid();
        List<String> parts = Arrays.asList(path.substring(1).split("/", -1));
        if (parts.stream().anyMatch(part -> !DIRECTORY_SEGMENT.matcher(part).matches() || part.equals("..") || part.equals("."))) throw invalid();
        if (parts.size() < 2 || !SEGMENT.matcher(parts.get(0)).matches() || !SEGMENT.matcher(parts.get(1)).matches()) throw invalid();
        String safePath = "/" + String.join("/", parts);
        return switch (host) {
            case "github.com", "www.github.com" -> githubPage(parts, safePath);
            case "skills.sh", "www.skills.sh" -> {
                if (parts.size() != 3 || !SEGMENT.matcher(parts.getLast()).matches()) throw invalid();
                yield github(URI.create("https://skills.sh" + safePath), parts.get(0), parts.get(1), "HEAD", null, parts.get(2));
            }
            case "clawhub.ai", "www.clawhub.ai", "clawhub.com", "www.clawhub.com" -> clawHub(parts, uri);
            case "skillhub.cn", "www.skillhub.cn" -> skillHub(parts, uri);
            default -> throw invalid();
        };
    }

    private static ExternalSkillLink githubPage(List<String> parts, String path) {
        URI page = URI.create("https://github.com" + path);
        if (parts.size() == 2) return github(page, parts.get(0), parts.get(1).replaceFirst("\\.git$", ""), "HEAD", null, null);
        if (parts.size() < 4) throw invalid();
        boolean blob = parts.get(2).equals("blob");
        if (!blob && !parts.get(2).equals("tree")) throw invalid();
        if (blob && (parts.size() < 5 || !parts.getLast().equalsIgnoreCase("SKILL.md"))) throw invalid();
        int end = parts.size() - (blob ? 1 : 0);
        return github(page, parts.get(0), parts.get(1), parts.get(3), !blob && end == 4 ? null : String.join("/", parts.subList(4, end)), null);
    }

    static ExternalSkillLink github(URI page, String owner, String repo, String ref, String directory, String skillName) {
        if (!SEGMENT.matcher(owner).matches() || !SEGMENT.matcher(repo).matches() || !SEGMENT.matcher(ref).matches()) throw invalid();
        return new ExternalSkillLink(page, URI.create("https://codeload.github.com/" + owner + "/" + repo + "/zip/" + ref),
                true, directory, skillName);
    }

    private static ExternalSkillLink clawHub(List<String> parts, URI uri) {
        String owner = null;
        if (parts.size() == 2 && !parts.getFirst().equals("skills")) owner = parts.getFirst();
        else if (parts.size() == 3 && parts.get(1).equals("skills")) owner = parts.getFirst();
        else if (parts.size() != 2 || !parts.getFirst().equals("skills")) throw invalid();
        String slug = parts.getLast();
        if (!SEGMENT.matcher(slug).matches()) throw invalid();
        String version = versionQuery(uri);
        String page = owner == null ? "/skills/" + slug : "/" + owner + "/skills/" + slug;
        String download = "/api/v1/download?slug=" + slug + (owner == null ? "" : "&ownerHandle=" + owner);
        return new ExternalSkillLink(URI.create("https://clawhub.ai" + page + versionSuffix(version, "?")),
                URI.create("https://clawhub.ai" + download + versionSuffix(version, "&")), false, null, null);
    }

    private static ExternalSkillLink skillHub(List<String> parts, URI uri) {
        if (!parts.getFirst().equals("skills") || parts.size() < 2 || parts.size() > 3) throw invalid();
        if (!SEGMENT.matcher(parts.getLast()).matches()) throw invalid();
        String slug = parts.size() == 3 ? "@" + parts.get(1) + "/" + parts.get(2) : parts.getLast();
        String version = versionQuery(uri);
        return new ExternalSkillLink(URI.create("https://skillhub.cn/" + String.join("/", parts) + versionSuffix(version, "?")),
                URI.create("https://api.skillhub.cn/api/v1/download?slug=" + encode(slug) + versionSuffix(version, "&")),
                false, null, null);
    }

    private static String versionQuery(URI uri) {
        if (uri.getRawQuery() == null) return null;
        for (String parameter : uri.getRawQuery().split("&")) {
            if (parameter.startsWith("version=")) {
                final String version;
                try {
                    version = URLDecoder.decode(parameter.substring(8).replace("+", "%2B"), StandardCharsets.UTF_8);
                } catch (IllegalArgumentException ex) {
                    throw invalid();
                }
                if (!VERSION.matcher(version).matches()) throw invalid();
                return version;
            }
        }
        return null;
    }

    private static String versionSuffix(String version, String separator) {
        return version == null ? "" : separator + "version=" + encode(version);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    static DomainBadRequestException invalid() {
        return new DomainBadRequestException("error.skill.external.link");
    }
}
