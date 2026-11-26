package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.springframework.stereotype.Component;

/** Decodes a final crop and writes fresh pixels, without client-supplied metadata. */
@Component
public class SkillAvatarImageProcessor {
    public static final int MAX_BYTES = 2 * 1024 * 1024;
    public static final int MAX_SIDE = 1024;
    static final int LOGO_MAX_BYTES = 1_000_000;
    private static final int LOGO_MAX_INPUT_SIDE = 4096;
    private static final int LOGO_MAX_OUTPUT_SIDE = 384;

    public byte[] normalize(byte[] input) {
        return normalize(input, true);
    }

    /** Shared safe raster normalization for avatars and other presentation images. */
    public byte[] normalize(byte[] input, boolean requireSquare) {
        return normalize(input, requireSquare, false);
    }

    byte[] normalizeLogo(byte[] input) {
        return normalize(input, false, true);
    }

    private byte[] normalize(byte[] input, boolean requireSquare, boolean logo) {
        int maxBytes = logo ? LOGO_MAX_BYTES - 1 : MAX_BYTES;
        int maxSide = logo ? LOGO_MAX_INPUT_SIDE : MAX_SIDE;
        if (input == null || input.length == 0 || input.length > maxBytes) {
            throw invalidImage();
        }
        boolean png = input.length >= 8 && (input[0] & 0xff) == 0x89
                && input[1] == 'P' && input[2] == 'N' && input[3] == 'G'
                && (input[4] & 0xff) == 13 && input[5] == 10 && (input[6] & 0xff) == 26 && input[7] == 10;
        boolean jpeg = input.length >= 3 && (input[0] & 0xff) == 0xff
                && (input[1] & 0xff) == 0xd8 && (input[2] & 0xff) == 0xff;
        if (!png && !jpeg) {
            throw invalidImage();
        }
        try (ImageInputStream stream = ImageIO.createImageInputStream(new ByteArrayInputStream(input))) {
            if (stream == null) {
                throw invalidImage();
            }
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) {
                throw invalidImage();
            }
            ImageReader reader = readers.next();
            try {
                if (!((png && "png".equalsIgnoreCase(reader.getFormatName()))
                        || (jpeg && "jpeg".equalsIgnoreCase(reader.getFormatName())))) {
                    throw invalidImage();
                }
                reader.setInput(stream, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || (requireSquare && width != height) || width > maxSide || height > maxSide) {
                    throw invalidImage();
                }
                var readParam = reader.getDefaultReadParam();
                if (logo) {
                    int square = Math.min(width, height);
                    readParam.setSourceRegion(new Rectangle((width - square) / 2, (height - square) / 2, square, square));
                    int sample = Math.max(1, square / (2 * LOGO_MAX_OUTPUT_SIDE));
                    readParam.setSourceSubsampling(sample, sample, 0, 0);
                    width = Math.min(square, LOGO_MAX_OUTPUT_SIDE);
                    height = width;
                }
                BufferedImage decoded = reader.read(0, readParam);
                if (decoded == null) {
                    throw invalidImage();
                }
                BufferedImage clean = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
                Graphics2D graphics = clean.createGraphics();
                try {
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(decoded, 0, 0, width, height, null);
                } finally {
                    graphics.dispose();
                }
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                if (!ImageIO.write(clean, "png", output) || output.size() > maxBytes) {
                    throw invalidImage();
                }
                return output.toByteArray();
            } finally {
                reader.dispose();
            }
        } catch (IOException | IllegalArgumentException failure) {
            throw invalidImage();
        }
    }

    private DomainBadRequestException invalidImage() {
        return new DomainBadRequestException("error.skill.avatar.invalidImage");
    }
}
