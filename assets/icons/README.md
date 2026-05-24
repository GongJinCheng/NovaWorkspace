# Nova App Icons

## Included
- icon-1024.svg — Master icon (1024x1024)
- icon-64.svg — Small icon (64x64)

## To generate platform icons:
### macOS (.icns)
```
# Using iconutil (macOS only):
# 1. Create iconset folder: mkdir Nova.iconset
# 2. Generate PNGs at 16,32,64,128,256,512,1024 (1x and 2x)
# 3. Run: iconutil -c icns Nova.iconset
```

### Windows (.ico)
Use an online converter like https://convertio.co/svg-ico/ or ImageMagick:
```
magick convert assets/icons/icon-1024.svg -define icon:auto-resize=256,128,64,48,32,16 assets/icons/nova.ico
```

### Linux (.png)
```
magick convert assets/icons/icon-1024.svg -resize 256x256 assets/icons/nova.png
```
