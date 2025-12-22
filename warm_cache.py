#!/usr/bin/env python3
"""
Warm up nginx cache by accessing all keyframe images
This forces nginx to load all files into its open_file_cache
Uses multiprocessing for maximum speed
"""

import os
import sys
from pathlib import Path
from multiprocessing import Pool, cpu_count, Manager
from tqdm import tqdm
import time

def get_all_keyframe_images(keyframe_dir):
    """Get all image files from keyframe directory"""
    image_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    images = []
    
    print(f"Scanning {keyframe_dir} for images...")
    for video_dir in sorted(Path(keyframe_dir).iterdir()):
        if video_dir.is_dir():
            for img_file in video_dir.iterdir():
                if img_file.suffix.lower() in image_extensions:
                    images.append(img_file)
    
    return images

def read_file_to_cache(img_path):
    """Read a single file to load it into cache"""
    try:
        with open(img_path, 'rb') as f:
            data = f.read()
            return len(data)
    except Exception as e:
        return 0

def warm_cache_parallel(keyframe_dir, num_workers=None):
    """Read all files to warm up system cache using multiprocessing"""
    images = get_all_keyframe_images(keyframe_dir)
    
    if num_workers is None:
        num_workers = cpu_count() * 2  # Use 2x CPU cores for I/O bound task
    
    print(f"\nFound {len(images):,} images")
    print(f"Using {num_workers} worker processes")
    print("Loading into cache...\n")
    
    start_time = time.time()
    total_size = 0
    
    # Use multiprocessing pool with progress bar
    with Pool(processes=num_workers) as pool:
        # Use imap for lazy iteration with progress
        results = pool.imap(read_file_to_cache, images, chunksize=100)
        
        # Progress bar
        for size in tqdm(results, total=len(images), desc="Caching images", unit="img"):
            total_size += size
    
    elapsed = time.time() - start_time
    total_gb = total_size / (1024**3)
    speed_mbps = (total_size / (1024**2)) / elapsed if elapsed > 0 else 0
    
    print(f"\n✓ Cache warming complete!")
    print(f"  Total images: {len(images):,}")
    print(f"  Total size: {total_gb:.2f} GB")
    print(f"  Time taken: {elapsed:.1f} seconds")
    print(f"  Speed: {speed_mbps:.1f} MB/s")
    print(f"  Workers: {num_workers}")
    print(f"\nAll keyframes are now cached in RAM!")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Warm up nginx cache with multiprocessing')
    parser.add_argument('-w', '--workers', type=int, default=None,
                       help=f'Number of worker processes (default: {cpu_count() * 2})')
    parser.add_argument('-d', '--directory', type=str, default="/root/AIC2025/data/keyframe",
                       help='Keyframe directory path')
    
    args = parser.parse_args()
    keyframe_dir = Path(args.directory)
    
    if not keyframe_dir.exists():
        print(f"Error: Keyframe directory not found: {keyframe_dir}")
        sys.exit(1)
    
    print("=" * 70)
    print("  🚀 Keyframe Cache Warmer (Multiprocessing Edition)")
    print("=" * 70)
    print()
    
    warm_cache_parallel(keyframe_dir, num_workers=args.workers)
    
    print("\n" + "=" * 70)
    print("  💡 Tip: Check cache status with ./check_cache_status.sh")
    print("=" * 70)

if __name__ == "__main__":
    main()

