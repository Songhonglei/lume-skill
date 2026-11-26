package com.iflytek.skillhub.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SitePresentationLink(
        @NotBlank @Size(max = 160) @Pattern(regexp = "[^\\p{Cntrl}]*") String title,
        @NotBlank @Size(max = 2048) String url) {
}
