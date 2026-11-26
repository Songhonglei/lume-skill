package com.iflytek.skillhub.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.iflytek.skillhub.domain.skill.SkillVersion;

public final class SkillPackageProvenance {
    private static final String EXTERNAL_URL = "externalSourceUrl";
    private static final ObjectMapper JSON = new ObjectMapper();

    private SkillPackageProvenance() {}

    public static void markExternal(SkillVersion version, String url) {
        try {
            ObjectNode metadata = (ObjectNode) JSON.readTree(version.getParsedMetadataJson());
            metadata.put(EXTERNAL_URL, url);
            version.setParsedMetadataJson(JSON.writeValueAsString(metadata));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Invalid publication metadata", ex);
        }
    }

    public static boolean isExternal(String metadata) {
        if (metadata == null) return false;
        try {
            var parsed = JSON.readTree(metadata);
            return parsed != null && parsed.path(EXTERNAL_URL).isTextual();
        } catch (JsonProcessingException ex) {
            return false;
        }
    }
}
