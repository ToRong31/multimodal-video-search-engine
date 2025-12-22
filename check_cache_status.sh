#!/bin/bash

echo "=== Nginx Keyframe Cache Status ==="
echo ""

# Check if nginx is running
if ! docker ps | grep -q nginx; then
    echo "❌ Nginx container is not running"
    exit 1
fi

echo "✓ Nginx container is running"
echo ""

# Check shared memory usage
echo "=== Shared Memory Usage (inside nginx container) ==="
docker exec nginx df -h /dev/shm 2>/dev/null || echo "Could not check /dev/shm"
echo ""

# Check system memory
echo "=== Host System Memory ==="
free -h
echo ""

# Show keyframe stats
echo "=== Keyframe Statistics ==="
echo "Total keyframe images: $(find data/keyframe -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) 2>/dev/null | wc -l)"
echo "Total keyframe size: $(du -sh data/keyframe 2>/dev/null | cut -f1)"
echo ""

# Check page cache usage (requires root)
if command -v vmtouch &> /dev/null; then
    echo "=== File Cache Status (vmtouch) ==="
    vmtouch -v data/keyframe 2>/dev/null | grep -E "(Files:|Resident Pages:|Locked Pages:)"
else
    echo "💡 Tip: Install vmtouch to see detailed cache statistics"
    echo "   apt-get install vmtouch (Ubuntu/Debian)"
    echo "   brew install vmtouch (macOS)"
fi

echo ""
echo "=== Configuration ==="
echo "nginx open_file_cache: max=1,000,000 files"
echo "nginx cache location: /dev/shm/nginx_keyframe_cache"
echo "nginx cache size: up to 100GB"
echo "Shared memory: 120GB"
echo ""
echo "✓ System ready for high-performance keyframe serving!"

