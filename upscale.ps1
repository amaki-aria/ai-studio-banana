param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [double]$Scale = 2.0,
  [int]$TargetWidth = 0,
  [int]$TargetHeight = 0,
  [int]$Sharpen = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$srcCode = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class BananaUpscaler {
    public static int[] Process(string inputPath, string outputPath, double scale, int targetW, int targetH, bool sharpen) {
        using (var src = new Bitmap(inputPath)) {
            int newW = targetW > 0 ? targetW : (int)Math.Round(src.Width * scale);
            int newH = targetH > 0 ? targetH : (int)Math.Round(src.Height * scale);
            if (targetW > 0 && targetH <= 0) {
                newH = (int)Math.Round((double)src.Height * targetW / src.Width);
            }

            using (var dst = new Bitmap(newW, newH, PixelFormat.Format32bppArgb)) {
                dst.SetResolution(src.HorizontalResolution, src.VerticalResolution);
                using (var g = Graphics.FromImage(dst)) {
                    g.CompositingMode = CompositingMode.SourceCopy;
                    g.CompositingQuality = CompositingQuality.HighQuality;
                    g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                    g.SmoothingMode = SmoothingMode.HighQuality;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    using (var attrs = new ImageAttributes()) {
                        attrs.SetWrapMode(WrapMode.TileFlipXY);
                        g.DrawImage(src, new Rectangle(0, 0, newW, newH), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, attrs);
                    }
                }

                if (sharpen) {
                    ApplyCrispSharpen(dst, 0.32);
                }

                string ext = System.IO.Path.GetExtension(outputPath).ToLowerInvariant();
                if (ext == ".jpg" || ext == ".jpeg") {
                    var codec = GetJpegCodec();
                    if (codec != null) {
                        using (var ep = new EncoderParameters(1)) {
                            ep.Param[0] = new EncoderParameter(Encoder.Quality, 95L);
                            dst.Save(outputPath, codec, ep);
                        }
                    } else {
                        dst.Save(outputPath, ImageFormat.Jpeg);
                    }
                } else {
                    dst.Save(outputPath, ImageFormat.Png);
                }
                return new int[] { src.Width, src.Height, newW, newH };
            }
        }
    }

    private static ImageCodecInfo GetJpegCodec() {
        foreach (var c in ImageCodecInfo.GetImageEncoders()) {
            if (c.FormatID == ImageFormat.Jpeg.Guid) return c;
        }
        return null;
    }

    private static void ApplyCrispSharpen(Bitmap bmp, double amount) {
        int w = bmp.Width;
        int h = bmp.Height;
        var rect = new Rectangle(0, 0, w, h);
        var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        int bytes = stride * h;
        byte[] src = new byte[bytes];
        byte[] dst = new byte[bytes];
        Marshal.Copy(data.Scan0, src, 0, bytes);
        Array.Copy(src, dst, bytes);

        for (int y = 1; y < h - 1; y++) {
            int row = y * stride;
            int rowUp = (y - 1) * stride;
            int rowDn = (y + 1) * stride;
            for (int x = 1; x < w - 1; x++) {
                int idx = row + x * 4;
                for (int c = 0; c < 3; c++) {
                    int center = src[idx + c];
                    int blur = (src[rowUp + x * 4 + c] + src[rowDn + x * 4 + c] + src[idx - 4 + c] + src[idx + 4 + c]) >> 2;
                    int val = (int)(center + amount * (center - blur));
                    if (val < 0) val = 0;
                    else if (val > 255) val = 255;
                    dst[idx + c] = (byte)val;
                }
            }
        }
        Marshal.Copy(dst, 0, data.Scan0, bytes);
        bmp.UnlockBits(data);
    }
}
"@

Add-Type -TypeDefinition $srcCode -ReferencedAssemblies System.Drawing
$dir = Split-Path -Path $OutputPath -Parent
if ($dir -and -not (Test-Path $dir)) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}
$res = [BananaUpscaler]::Process($InputPath, $OutputPath, $Scale, $TargetWidth, $TargetHeight, ($Sharpen -ne 0))
Write-Output ("{0}x{1} -> {2}x{3}" -f $res[0], $res[1], $res[2], $res[3])
