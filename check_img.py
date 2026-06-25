import sys
from PIL import Image

try:
    img = Image.open('logo-collapsed.png')
    img = img.convert("RGBA")
    width, height = img.size
    pixels = img.load()
    
    alpha_sum = 0
    # check 4 corners
    corners = [(0,0), (width-1, 0), (0, height-1), (width-1, height-1)]
    for c in corners:
        p = pixels[c[0], c[1]]
        print(f"Corner {c}: {p}")
        
    print(f"Size: {width}x{height}")
    
except Exception as e:
    print(f"Error: {e}")
