package com.iflytek.skillhub.domain.user;

import java.util.regex.Pattern;

/** Identifies the first-party SVGs served by the Web application. */
public final class ProfileAvatar {
    public static final String ID_PATTERN =
            "fox|rabbit|cat|bear|panda|owl|koi|deer|bee|turtle|octopus|hedgehog"
                    + "|fern|ginkgo|cactus|bamboo|lotus|mushroom|sprout|sunflower";

    private static final Pattern STORED_PATH = Pattern.compile("/avatars/(?:" + ID_PATTERN + ")\\.svg");

    private ProfileAvatar() {}

    public static String path(String id) {
        return "/avatars/" + id + ".svg";
    }

    public static boolean isPreset(String avatarUrl) {
        return avatarUrl != null && STORED_PATH.matcher(avatarUrl).matches();
    }
}
