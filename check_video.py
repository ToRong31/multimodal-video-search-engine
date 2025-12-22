import os
import subprocess

ROOT = "./data/video"
OUTFILE = "bad_videos.txt"

def get_video_codec(path):
    # chạy ffprobe để lấy codec
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name",
        "-of", "default=nw=1:nk=1",
        path,
    ]
    try:
        out = subprocess.check_output(cmd, text=True).strip()
        return out
    except subprocess.CalledProcessError:
        return None

bad = []

for dirpath, dirnames, filenames in os.walk(ROOT):
    for name in filenames:
        if not name.lower().endswith(".mp4"):
            continue
        fullpath = os.path.join(dirpath, name)
        codec = get_video_codec(fullpath)
        if codec is None:
            print(f"[ERR] {fullpath} -> ffprobe fail")
            bad.append((fullpath, "ffprobe_fail"))
        elif codec != "h264":
            print(f"[BAD] {fullpath} -> codec={codec}")
            bad.append((fullpath, codec))
        else:
            print(f"[OK ] {fullpath}")

with open(OUTFILE, "w", encoding="utf-8") as f:
    f.write("# Các video có khả năng không play được trong browser (không phải h264)\n")
    for path, codec in bad:
        f.write(f"{path}\t{codec}\n")

print(f"Done. Ghi vào {OUTFILE}")
