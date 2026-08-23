const fs = require('fs');
const path = require('path');

const filePath = path.join('d:/Workspace/Unlox/code/taddle/taddlebox-app', 'src', 'screens', 'main', 'ReelItem.tsx');
let content = fs.readFileSync(filePath, 'utf8');

const maskComponent = `
const MediaEdgeMask = ({ children, width, height }: { children: React.ReactNode, width: number, height: number }) => {
  const fadeSize = Math.min(60, height * 0.15); 
  const p1 = fadeSize / height;
  return (
    <MaskedView
      style={{ width, height }}
      maskElement={
        <LinearGradient
          colors={[
            "transparent",
            "rgba(0,0,0,0.04)",
            "rgba(0,0,0,0.16)",
            "rgba(0,0,0,0.36)",
            "rgba(0,0,0,0.64)",
            "black",
            "black",
            "rgba(0,0,0,0.64)",
            "rgba(0,0,0,0.36)",
            "rgba(0,0,0,0.16)",
            "rgba(0,0,0,0.04)",
            "transparent"
          ]}
          locations={[
            0,
            p1 * 0.2,
            p1 * 0.4,
            p1 * 0.6,
            p1 * 0.8,
            p1,
            1 - p1,
            1 - p1 + p1 * 0.2,
            1 - p1 + p1 * 0.4,
            1 - p1 + p1 * 0.6,
            1 - p1 + p1 * 0.8,
            1
          ]}
          style={{ flex: 1 }}
        />
      }
    >
      {children}
    </MaskedView>
  );
};
`;

if (!content.includes('MediaEdgeMask')) {
    content = content.replace(
        'const AmbientBackground =',
        maskComponent + '\nconst AmbientBackground ='
    );
}

// 1. Carousel
content = content.replace(
    /return \(\s*<AmbientBackground key=\{idx\} url=\{url \|\| m\.preview_url\}>\s*\{isVid && url \? \(\s*isActive \? \(\s*<ActiveVideo([\s\S]*?)isPausedOverride=\{isPaused\}\s*\/>\s*\) : \(\s*<Image\s+source=\{\{ uri: m\.preview_url \|\| url \}\}\s+style=\{\{ width: dims\.width, height: dims\.height \}\}\s+contentFit="contain"\s*\/>\s*\)\s*\) : url \? \(\s*<Image\s+source=\{\{ uri: url \}\}\s+style=\{\{ width: dims\.width, height: dims\.height \}\}\s+contentFit="contain"\s+transition=\{200\}\s*\/>\s*\) : null\}\s*<\/AmbientBackground>\s*\);/g,
    `return (
                <AmbientBackground key={idx} url={url || m.preview_url}>
                  <MediaEdgeMask width={dims.width} height={dims.height}>
                    {isVid && url ? (
                      isActive ? (
                        <ActiveVideo$1isPausedOverride={isPaused}
                        />
                      ) : (
                        <Image
                          source={{ uri: m.preview_url || url }}
                          style={{ width: dims.width, height: dims.height }}
                          contentFit="contain"
                        />
                      )
                    ) : url ? (
                      <Image
                        source={{ uri: url }}
                        style={{ width: dims.width, height: dims.height }}
                        contentFit="contain"
                        transition={200}
                      />
                    ) : null}
                  </MediaEdgeMask>
                </AmbientBackground>
              );`
);

// 2. Video
content = content.replace(
    /<AmbientBackground url=\{firstMedia\?\.preview_url \|\| mediaUrl\}>\s*<ZoomableMedia\s+width=\{dims\.width\}\s+height=\{dims\.height\}\s+onPinchStateChange=\{onPinchStateChange\}\s*>\s*\{isActive \? \([\s\S]*?contentFit="contain"\s*\/>\s*\)\}\s*<\/ZoomableMedia>\s*<\/AmbientBackground>/g,
    `<AmbientBackground url={firstMedia?.preview_url || mediaUrl}>
          <MediaEdgeMask width={dims.width} height={dims.height}>
            <ZoomableMedia
              width={dims.width}
              height={dims.height}
              onPinchStateChange={onPinchStateChange}
            >
              {isActive ? (
                <ActiveVideo
                  url={mediaUrl}
                  width={dims.width}
                  height={dims.height}
                  muted={!!isMuted}
                  loop
                  isPausedOverride={isPaused}
                />
              ) : (
                <Image
                  source={{ uri: firstMedia?.preview_url || mediaUrl }}
                  style={{ width: dims.width, height: dims.height }}
                  contentFit="contain"
                />
              )}
            </ZoomableMedia>
          </MediaEdgeMask>
        </AmbientBackground>`
);

// 3. Audio
content = content.replace(
    /<AmbientBackground url=\{firstMedia\?\.preview_url\}>\s*<ZoomableMedia\s+width=\{SCREEN_W\}\s+height=\{SCREEN_W\}\s+onPinchStateChange=\{onPinchStateChange\}\s*>[\s\S]*?<\/ZoomableMedia>\s*<\/AmbientBackground>/g,
    `<AmbientBackground url={firstMedia?.preview_url}>
          <MediaEdgeMask width={SCREEN_W} height={SCREEN_W}>
            <ZoomableMedia
              width={SCREEN_W}
              height={SCREEN_W}
              onPinchStateChange={onPinchStateChange}
            >
              {firstMedia?.preview_url ? (
                <Image
                  source={{ uri: firstMedia.preview_url }}
                  style={{ width: SCREEN_W, height: SCREEN_W }}
                  contentFit="cover"
                />
              ) : (
                <LinearGradient
                  colors={[reelBg2, reelBg1]}
                  style={{
                    width: SCREEN_W,
                    height: SCREEN_H,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="musical-notes" size={64} color="#7C3AED" />
                </LinearGradient>
              )}
            </ZoomableMedia>
          </MediaEdgeMask>
        </AmbientBackground>`
);

// 4. Image
content = content.replace(
    /<AmbientBackground url=\{mediaUrl\}>\s*<ZoomableMedia\s+width=\{dims\.width\}\s+height=\{dims\.height\}\s+onPinchStateChange=\{onPinchStateChange\}\s*>\s*<Image\s+source=\{\{ uri: mediaUrl \}\}\s+style=\{\{ width: dims\.width, height: dims\.height \}\}\s+contentFit="contain"\s+transition=\{200\}\s*\/>\s*<\/ZoomableMedia>\s*<\/AmbientBackground>/g,
    `<AmbientBackground url={mediaUrl}>
          <MediaEdgeMask width={dims.width} height={dims.height}>
            <ZoomableMedia
              width={dims.width}
              height={dims.height}
              onPinchStateChange={onPinchStateChange}
            >
              <Image
                source={{ uri: mediaUrl }}
                style={{ width: dims.width, height: dims.height }}
                contentFit="contain"
                transition={200}
              />
            </ZoomableMedia>
          </MediaEdgeMask>
        </AmbientBackground>`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully injected MaskedView wrapper');
