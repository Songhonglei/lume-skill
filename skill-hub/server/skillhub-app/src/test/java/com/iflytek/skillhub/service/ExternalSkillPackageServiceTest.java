package com.iflytek.skillhub.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.iflytek.skillhub.config.SkillPublishProperties;
import com.iflytek.skillhub.controller.support.SkillPackageArchiveExtractor;
import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.skill.metadata.SkillMetadataParser;
import com.iflytek.skillhub.domain.skill.validation.PackageEntry;
import com.iflytek.skillhub.domain.skill.validation.SkillPackageValidator;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;

class ExternalSkillPackageServiceTest {
    private static final String GITHUB = "https://github.com/example/repo/tree/main/.agents/skills/demo";
    private static final String SKILL_MD = "---\nname: demo\ndescription: Demonstrates format validation.\n---\n\n# Demo\n";

    private final SkillPublishProperties properties = new SkillPublishProperties();
    private final SkillMetadataParser parser = new SkillMetadataParser();
    private final ExternalSkillPackageService service = spy(new ExternalSkillPackageService(
            new SkillPackageArchiveExtractor(properties),
            new SkillPackagePreviewService(new SkillPackageValidator(parser), parser),
            properties, new ObjectMapper()));

    @Test
    void derivesOnlyFixedProviderAddressesAndCanonicalPublicLinks() {
        assertThat(ExternalSkillLink.parse(GITHUB + "?ignored=abc#readme").page()).isEqualTo(URI.create(GITHUB));
        assertThat(ExternalSkillLink.parse(GITHUB).directory()).isEqualTo(".agents/skills/demo");
        assertThat(ExternalSkillLink.parse("https://skills.sh/example/repo/demo").skillName()).isEqualTo("demo");
        assertThat(ExternalSkillLink.parse("https://clawhub.ai/example/skills/demo?version=1.0.0").download().toString())
                .isEqualTo("https://clawhub.ai/api/v1/download?slug=demo&ownerHandle=example&version=1.0.0");
        assertThat(ExternalSkillLink.parse("https://www.skillhub.cn/skills/example/demo").download().toString())
                .isEqualTo("https://api.skillhub.cn/api/v1/download?slug=%40example%2Fdemo");
        for (String url : List.of("http://github.com/x/y", "https://github.com.example.invalid/a/b",
                "https://github.com@other.invalid/a/b", "https://github.com:8443/a/b",
                "https://github.com/a/b/tree/main/%2E%2E", "https://skills.sh/example/repo")) {
            assertThatThrownBy(() -> ExternalSkillLink.parse(url)).isInstanceOf(DomainBadRequestException.class);
        }
    }

    @Test
    void validatesOnlyTheRequestedFolderAndRefusesDifferentSubmittedContent() throws IOException {
        doReturn(zip(Map.of(
                "repo-main/.agents/skills/demo/SKILL.md", SKILL_MD,
                "repo-main/.agents/skills/demo/references/guide.md", "# Guide",
                "repo-main/another/SKILL.md", SKILL_MD,
                "repo-main/unrelated.lock", "repository configuration"))).when(service).download(any());
        var resolved = service.resolve(GITHUB);
        assertThat(resolved.entries()).extracting(PackageEntry::path).containsExactlyInAnyOrder("SKILL.md", "references/guide.md");
        assertThat(service.verify(GITHUB, resolved.entries())).isEqualTo(GITHUB);
        assertThatThrownBy(() -> service.verify(GITHUB, List.of(resolved.entries().getFirst())))
                .isInstanceOf(DomainBadRequestException.class).hasMessageContaining("external.changed");
    }

    @Test
    void resolvesGithubBlobDirectoriesWithoutImportingSiblingSkills() throws IOException {
        String blobFolder = GITHUB.replace("/tree/", "/blob/");
        String blobFile = blobFolder + "/SKILL.md";
        doReturn(zip(Map.of(
                "repo-main/.agents/skills/demo/SKILL.md", SKILL_MD,
                "repo-main/.agents/skills/demo/references/guide.md", "# Guide",
                "repo-main/.agents/skills/demo/README.md", "# Readme",
                "repo-main/.agents/skills/another/SKILL.md", SKILL_MD))).when(service).download(any());

        var folder = service.resolve(blobFolder + "?plain=1#readme");
        var file = service.resolve(blobFile);
        assertThat(folder.sourceUrl()).isEqualTo(GITHUB);
        assertThat(file.sourceUrl()).isEqualTo(blobFile);
        assertThat(folder.entries()).extracting(PackageEntry::path)
                .containsExactlyInAnyOrder("SKILL.md", "references/guide.md", "README.md");
        assertThat(service.verify(folder.sourceUrl(), file.entries())).isEqualTo(GITHUB);
        assertThat(ExternalSkillLink.parse(blobFolder).download()).isEqualTo(ExternalSkillLink.parse(GITHUB).download());
        assertThatThrownBy(() -> service.resolve(blobFolder + "/README.md"))
                .isInstanceOf(DomainBadRequestException.class).hasMessageContaining("external.directory");
        assertThatThrownBy(() -> service.resolve(blobFolder + "/missing"))
                .isInstanceOf(DomainBadRequestException.class).hasMessageContaining("external.directory");
    }

    @Test
    void rejectsAmbiguousFoldersAndMalformedAgentSkills() throws IOException {
        doReturn(zip(Map.of("repo-head/a/SKILL.md", SKILL_MD, "repo-head/b/SKILL.md", SKILL_MD)))
                .when(service).download(any());
        assertThatThrownBy(() -> service.resolve("https://github.com/example/repo"))
                .isInstanceOf(DomainBadRequestException.class).hasMessageContaining("external.directory");
        doReturn(zip(Map.of("SKILL.md", "# Missing frontmatter"))).when(service).download(any());
        assertThatThrownBy(() -> service.resolve("https://skillhub.cn/skills/demo"))
                .isInstanceOf(DomainBadRequestException.class);
    }

    private static byte[] zip(Map<String, String> files) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream archive = new ZipOutputStream(bytes)) {
            for (var file : files.entrySet()) {
                archive.putNextEntry(new ZipEntry(file.getKey()));
                archive.write(file.getValue().getBytes(StandardCharsets.UTF_8));
                archive.closeEntry();
            }
        }
        return bytes.toByteArray();
    }
}
