package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.domain.shared.exception.DomainNotFoundException;
import com.iflytek.skillhub.dto.SitePresentationAssetResponse;
import com.iflytek.skillhub.storage.ObjectStorageService;
import com.iflytek.skillhub.storage.StorageAccessException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/** Restricts public reads to normalized branding images in an isolated storage prefix. */
@Service
public class SitePresentationAssetService {
    private static final String URL_PREFIX = "/api/v1/site-presentation/assets/";
    private static final String STORAGE_PREFIX = "site-presentation/assets/";
    private static final String LOGO_PREFIX = "logo-";
    private static final Pattern ASSET_ID = Pattern.compile(
            "(?:logo-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private final ObjectStorageService storage;
    private final SkillAvatarImageProcessor images;

    public SitePresentationAssetService(ObjectStorageService storage, SkillAvatarImageProcessor images) {
        this.storage = storage;
        this.images = images;
    }

    public SitePresentationAssetResponse upload(MultipartFile file) {
        return upload(file, false);
    }

    public SitePresentationAssetResponse uploadLogo(MultipartFile file) {
        return upload(file, true);
    }

    private SitePresentationAssetResponse upload(MultipartFile file, boolean logo) {
        int maxBytes = logo ? SkillAvatarImageProcessor.LOGO_MAX_BYTES - 1 : SkillAvatarImageProcessor.MAX_BYTES;
        if (file.isEmpty() || file.getSize() > maxBytes) throw invalidImage(logo);
        byte[] normalized;
        try (var input = file.getInputStream()) {
            byte[] bytes = input.readNBytes(maxBytes + 1);
            normalized = logo ? images.normalizeLogo(bytes) : images.normalize(bytes, false);
        } catch (IOException | DomainBadRequestException failure) {
            throw invalidImage(logo);
        }
        String id = (logo ? LOGO_PREFIX : "") + UUID.randomUUID();
        storage.putObject(key(id), new ByteArrayInputStream(normalized), normalized.length, "image/png");
        return new SitePresentationAssetResponse(URL_PREFIX + id);
    }

    public void validateReference(String url) {
        if (url == null) return;
        if (!url.startsWith(URL_PREFIX)) throw invalidReference();
        String id = url.substring(URL_PREFIX.length());
        if (!ASSET_ID.matcher(id).matches() || !storage.exists(key(id))) throw invalidReference();
    }

    public void validateLogoReference(String url, String previous) {
        if (url != null && !url.equals(previous) && !url.startsWith(URL_PREFIX + LOGO_PREFIX)) {
            throw new DomainBadRequestException("error.site.presentation.uploadLogo");
        }
        validateReference(url);
    }

    public byte[] read(String id) {
        if (!ASSET_ID.matcher(id).matches() || !storage.exists(key(id))) {
            throw new DomainNotFoundException("error.site.presentation.assetNotFound");
        }
        try (var input = storage.getObject(key(id))) {
            byte[] bytes = input.readNBytes(SkillAvatarImageProcessor.MAX_BYTES + 1);
            if (bytes.length > SkillAvatarImageProcessor.MAX_BYTES) {
                throw new StorageAccessException("read", key(id), new IOException("Invalid branding asset size"));
            }
            return bytes;
        } catch (IOException failure) {
            throw new StorageAccessException("read", key(id), failure);
        }
    }

    private String key(String id) { return STORAGE_PREFIX + id + ".png"; }
    private DomainBadRequestException invalidImage(boolean logo) {
        return new DomainBadRequestException(logo ? "error.site.presentation.invalidLogo" : "error.site.presentation.invalidImage");
    }
    private DomainBadRequestException invalidReference() {
        return new DomainBadRequestException("error.site.presentation.invalidAsset");
    }
}
