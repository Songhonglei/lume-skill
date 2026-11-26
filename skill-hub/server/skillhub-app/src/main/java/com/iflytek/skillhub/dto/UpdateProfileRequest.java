package com.iflytek.skillhub.dto;

import com.iflytek.skillhub.domain.user.ProfileAvatar;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Request DTO for updating user profile fields.
 *
 * <p>All fields are optional — the caller supplies only the fields they want to change.
 * At least one non-null field must be present (validated in the controller).
 *
 * <p>Validation rules for displayName:
 * <ul>
 *   <li>Length: 2–32 characters (after trim)</li>
 *   <li>Allowed characters: Chinese, English, digits, spaces, underscore, hyphen</li>
 * </ul>
 *
 * @param displayName new display name (nullable — omit to leave unchanged)
 * @param avatarId an ID from the built-in avatar collection
 */
public record UpdateProfileRequest(
        @Size(min = 2, max = 32, message = "error.profile.displayName.length")
        @Pattern(regexp = "^[\\u4e00-\\u9fa5a-zA-Z0-9_ -]+$",
                 message = "error.profile.displayName.pattern")
        String displayName,
        @Pattern(
                regexp = ProfileAvatar.ID_PATTERN,
                message = "error.profile.avatar.invalid")
        String avatarId
) {
    /**
     * Returns true if at least one field is provided.
     */
    public boolean hasChanges() {
        return displayName != null || avatarId != null;
    }
}
