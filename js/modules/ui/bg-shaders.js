// 背景的兩支 fragment shader（「光有 movement」那一份；user 2026-11-26 在背景試驗場 https://claude.ai/artifact/YJ4JpmdDhwZsArffEnphKX 定的）。
// 照試驗場原文搬、不要在這裡改：要改去試驗場改好再重搬（scratchpad 的 port-bg.cjs 那種做法：抽 <script type="x-shader/x-fragment"> 的內容）。
// img-move＝畫面（光跡＋中空板＋配色）、buf-move＝光跡（自己接自己，筆刷的 //@brush 在 bg.js 換進去）
export const SHADERS = {
  'img-move': String.raw`#ifdef GL_ES
precision highp float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uBufferA;

// + LOOK: 0 = invisible board (as written), 1 = edges only, 2 = visible board. See the end of main().
uniform float uLook;

// + BEND: how far the light is thrown out of line at a board's edges. 0 = as written. See getOpticalLight().
uniform float uBend;

// + SOFT: the trail, blurred (a quarter-size copy made every frame). See softTrail().
uniform sampler2D uSoft;

// + COLOR: a palette for the light. uTint 0 = the light exactly as written: none of this runs.
// uTint 1 = the light takes its colour from a palette of five (uPal); uDay 1 = on white paper.
// See the end of main().
uniform float uTint;
uniform float uDay;
uniform vec3 uPal[5];
// + COLOR: how far the colours are from white. 1 = as the palette has them, less = paler.
uniform float uDepth;

// + COLOR: the paper of the day version.
const vec3 PAPER = vec3(0.985, 0.985, 0.975);

// + COLOR: the palette's five colours laid across the canvas as one slow, drifting gradient.
// The light takes the colour of wherever it is.
vec3 paletteAt(vec2 uv) {
    // A long gradient: the whole canvas covers about one step of the five (one colour to its
    // neighbour), so at any one time only neighbouring hues are on screen. Time carries it
    // round the palette, one colour about every 8 seconds.
    float k =
        uv.x * 0.16 + uv.y * 0.08 + uTime * 0.025
        + 0.020 * sin(uv.y * 4.0 + uTime * 0.11)
        + 0.015 * sin(uv.x * 5.5 - uTime * 0.07);

    k = fract(k) * 5.0;

    vec3 colour = vec3(0.0);

    for (int j = 0; j < 5; j++) {
        // How near this colour is, going round (after the fifth comes the first).
        float d = abs(k - float(j));
        d = min(d, 5.0 - d);

        float w = max(0.0, 1.0 - d);

        colour += uPal[j] * (w * w * (3.0 - 2.0 * w));
    }

    // Keep it a clean tint. Halfway between two colours a plain mix goes grey (pink + mint = grey,
    // which reads as muddy); scaled so its strongest channel is full, it goes pale instead.
    colour /= max(colour.r, max(colour.g, colour.b));

    // Paler or deeper: move every channel toward / away from white.
    return clamp(1.0 - (1.0 - colour) * uDepth, 0.0, 1.0);
}

// --------------------------------------------------
// 1. INVISIBLE SLICE GEOMETRY
// --------------------------------------------------

float baseBoundary(int i) {
    if (i == 0) return 0.000;
    if (i == 1) return 0.085;
    if (i == 2) return 0.225;
    if (i == 3) return 0.315;
    if (i == 4) return 0.475;
    if (i == 5) return 0.590;
    if (i == 6) return 0.690;
    if (i == 7) return 0.835;
    return 1.000;
}

float boundaryMotion(int i) {
    if (i == 0 || i == 8) return 0.0;

    float n = float(i);

    return sin(uTime * 0.16 + n * 1.25) * 0.2025
         + sin(uTime * 0.09 + n * 1.85) * 0.2012;
}

float boundary(int i) {
    return baseBoundary(i) + boundaryMotion(i);
}

// --------------------------------------------------
// 2. OPTICAL COORDINATES
// --------------------------------------------------

// Geometry affects the light field only.
// It never creates a visible board or a separate layer.

void getOpticalInfo(
    float x,
    out float localX,
    out float cellWidth,
    out float cellIndex,
    out float opticalMask
) {
    localX = 0.5;
    cellWidth = 0.1;
    cellIndex = 0.0;
    opticalMask = 0.0;

    for (int i = 0; i < 8; i++) {
        float left = boundary(i);
        float right = boundary(i + 1);
        float slotWidth = right - left;

        float gapWave =
            0.5 + 0.5 * sin(float(i) * 1.35 + uTime * 0.10);

        float gapRatio = mix(0.15, 0.21, gapWave);

        float boardLeft = left + slotWidth * gapRatio;
        float boardRight = right - slotWidth * gapRatio;
        float width = boardRight - boardLeft;

        if (x >= boardLeft && x < boardRight) {
            localX = (x - boardLeft) / width;
            cellWidth = width;
            cellIndex = float(i);
            opticalMask = 1.0;
        }
    }
}

// Find the nearest invisible optical boundary.
void getNearestEdge(
    float x,
    out float nearestEdge,
    out float edgeDistance
) {
    nearestEdge = 0.0;
    edgeDistance = 1.0;

    for (int i = 0; i < 8; i++) {
        float left = boundary(i);
        float right = boundary(i + 1);
        float slotWidth = right - left;

        float gapWave =
            0.5 + 0.5 * sin(float(i) * 1.35 + uTime * 0.10);

        float gapRatio = mix(0.15, 0.21, gapWave);

        float boardLeft = left + slotWidth * gapRatio;
        float boardRight = right - slotWidth * gapRatio;

        float leftDistance = abs(x - boardLeft);
        float rightDistance = abs(x - boardRight);

        if (leftDistance < edgeDistance) {
            edgeDistance = leftDistance;
            nearestEdge = boardLeft;
        }

        if (rightDistance < edgeDistance) {
            edgeDistance = rightDistance;
            nearestEdge = boardRight;
        }
    }
}

// --------------------------------------------------
// 3. ORIGINAL LIGHT FIELD
// --------------------------------------------------

float readTrail(vec2 uv) {
    // + EDGE: mirror at the canvas edges instead of clamping. The board shift (錯位) pushes taps
    // past the edge; clamped, every row there repeated the one edge pixel of that row, so a
    // textured mark drawn at the very edge became rows of horizontal lines.
    uv = clamp(1.0 - abs(1.0 - abs(uv)), vec2(0.001), vec2(0.999));
    return texture2D(uBufferA, uv).r;
}

float smoothTrail(vec2 uv) {
    vec2 px = 1.0 / uResolution;

    float sum = readTrail(uv) * 4.0;

    sum += readTrail(uv + vec2(px.x, 0.0)) * 2.0;
    sum += readTrail(uv - vec2(px.x, 0.0)) * 2.0;
    sum += readTrail(uv + vec2(0.0, px.y)) * 2.0;
    sum += readTrail(uv - vec2(0.0, px.y)) * 2.0;

    sum += readTrail(uv + px);
    sum += readTrail(uv - px);
    sum += readTrail(uv + vec2(px.x, -px.y));
    sum += readTrail(uv + vec2(-px.x, px.y));

    return sum / 16.0;
}

// + SOFT: the blurred trail. Everything sampled AWAY from the point being drawn reads this
// instead of the sharp trail. Read sharp, each off-point tap showed up as its own copy of
// the mark; with a fine or textured mark the copies stacked into rows of horizontal lines.
float softTrail(vec2 uv) {
    // + EDGE: mirror at the canvas edges instead of clamping. The board shift (錯位) pushes taps
    // past the edge; clamped, every row there repeated the one edge pixel of that row, so a
    // textured mark drawn at the very edge became rows of horizontal lines.
    uv = clamp(1.0 - abs(1.0 - abs(uv)), vec2(0.001), vec2(0.999));
    return texture2D(uSoft, uv).r;
}

float getLight(vec2 uv) {
    float center = smoothTrail(uv);

    // + SOFT: these four taps were smoothTrail().
    float x1 = softTrail(uv + vec2(0.006, 0.0));
    float x2 = softTrail(uv - vec2(0.006, 0.0));

    float y1 = softTrail(uv + vec2(0.0, 0.008));
    float y2 = softTrail(uv - vec2(0.0, 0.008));

    float wide = max(max(x1, x2), max(y1, y2));

    float core = pow(center, 0.75);
    float halo = pow(wide, 1.15);

    return clamp(core * 0.85 + halo * 0.45, 0.0, 1.0);
}

// + SOFT: getLight() for a point away from the one being drawn: the same formula,
// every tap from the blurred trail. Used for the wide aura ("broad").
float softLight(vec2 uv) {
    float center = softTrail(uv);

    float x1 = softTrail(uv + vec2(0.006, 0.0));
    float x2 = softTrail(uv - vec2(0.006, 0.0));

    float y1 = softTrail(uv + vec2(0.0, 0.008));
    float y2 = softTrail(uv - vec2(0.0, 0.008));

    float wide = max(max(x1, x2), max(y1, y2));

    float core = pow(center, 0.75);
    float halo = pow(wide, 1.15);

    return clamp(core * 0.85 + halo * 0.45, 0.0, 1.0);
}

// --------------------------------------------------
// 4. VERTICAL EDGE LIGHT
// --------------------------------------------------

// Light hitting an invisible edge spreads vertically.
// The result is a continuous soft light column,
// not a visible outline.

float getVerticalEdgeLight(float edgeX, float y) {
    // + SOFT: these reads were readTrail(). Read sharp, the column repeated whatever was on
    // the one pixel column of the edge, row by row: a textured mark became horizontal stripes.
    float center = softTrail(vec2(edgeX, y));

    float total = center;
    float totalWeight = 1.0;

    for (int i = 1; i <= 12; i++) {
        float d = float(i) * 0.006;

        float above = softTrail(vec2(edgeX, y + d));
        float below = softTrail(vec2(edgeX, y - d));

        // + GLOW: "* (1.0 - ...)" lets the last taps run out to nothing. Without it the
        // column stopped dead at the twelfth tap, a flat top and bottom.
        float weight = exp(-d * 19.0)
            * (1.0 - pow(float(i) / 13.0, 2.0));

        total += (above + below) * weight;
        totalWeight += weight * 2.0;
    }

    return clamp(total / totalWeight * 2.0, 0.0, 1.0);
}

// --------------------------------------------------
// 5. EDGE GLOW FIELD
// --------------------------------------------------

float getEdgeGlow(
    vec2 uv,
    float nearestEdge,
    float edgeDistance
) {
    float edgeSource = getVerticalEdgeLight(
        nearestEdge,
        uv.y
    );

    // Broad horizontal spread.
    // Maximum intensity is exactly at the edge.
    // + GLOW: the spread was 0.018 all the way up and down, a straight-sided bar.
    // It now follows how much light is on the edge at this height, so the glow swells
    // where the mark crosses the edge and tapers away from it, and two slow waves keep
    // its outline from being symmetrical.
    float reach = 0.018
        * (0.30 + 0.70 * sqrt(edgeSource))
        * (1.0
            + 0.22 * sin(uv.y * 23.0 + nearestEdge * 37.0 + uTime * 0.60)
            + 0.13 * sin(uv.y * 51.0 - nearestEdge * 19.0 - uTime * 0.85));

    float horizontalSpread = exp(
        -pow(edgeDistance / reach, 2.0)
    );

    return clamp(
        edgeSource * horizontalSpread * 0.85,
        0.0,
        1.0
    );
}

// --------------------------------------------------
// 6. LIGHT ENERGY CONCENTRATION
// --------------------------------------------------

// Original trail is dimmer.
// Its intensity rises toward the nearest edge.
// At edgeDistance = 0, energy reaches its maximum.

float getEdgeEnergy(float edgeDistance) {
    float transferRange = 0.055;

    float proximity = exp(
        -pow(edgeDistance / transferRange, 1.5)
    );

    return mix(0.48, 1.0, proximity);
}

// --------------------------------------------------
// 7. OPTICAL LIGHT TRANSFORMATION
// --------------------------------------------------

vec3 getOpticalLight(
    vec2 uv,
    float localX,
    float cellWidth,
    float cellIndex,
    float opticalMask
) {
    float centered = localX * 2.0 - 1.0;
    float face = 1.0 - centered * centered;

    float direction =
        mod(cellIndex, 2.0) < 1.0 ? 1.0 : -1.0;

    float lensShift =
        centered * face *
        cellWidth * 0.22 * direction;

    lensShift +=
        sin(uTime * 0.55 + cellIndex * 1.7)
        * 0.0015 * face;

    // + BEND: the shift above is zero at both edges of a board (face = 0 there), so a line
    // drawn across a board stays in one piece. This adds a shift that is largest at the
    // edges: each board squeezes (1 + uBend) times its own width of the light field into
    // itself, like a fluted pane, and the light no longer lines up across an edge.
    // uBend 0 = as written.
    lensShift += centered * cellWidth * 0.5 * uBend;

    // Displacement smoothly disappears outside optical regions.
    lensShift *= opticalMask;

    vec2 opticalUV = uv + vec2(lensShift, 0.0);

    float light = getLight(opticalUV);

    // + SOFT: these two were getLight().
    float broad = softLight(
        opticalUV + vec2(0.0, 0.012)
    );

    broad = max(
        broad,
        softLight(opticalUV - vec2(0.0, 0.012))
    );

    float dispersion = 0.0018 + cellWidth * 0.004;
    dispersion *= opticalMask;

    float redLight = getLight(
        opticalUV - vec2(dispersion, 0.0)
    );

    float blueLight = getLight(
        opticalUV + vec2(dispersion, 0.0)
    );

    vec3 spectralLight = vec3(
        redLight * 0.94,
        light,
        blueLight * 1.06
    );

    vec3 color = vec3(
        0.004,
        0.007,
        0.014
    );

    color += spectralLight * 0.95;
    color += vec3(0.055, 0.12, 0.19) * broad * 0.65;

    return color;
}

// --------------------------------------------------
// 8. FINAL LIGHT FIELD
// --------------------------------------------------

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;

    vec3 background = vec3(
        0.004,
        0.007,
        0.014
    );

    // Reserved Buffer A state pixel.
    if (
        gl_FragCoord.x < 1.0 &&
        gl_FragCoord.y < 1.0
    ) {
        // + COLOR: "mix(..., PAPER, uTint * uDay)" so the pixel is paper in the day palette version.
        gl_FragColor = vec4(mix(background, PAPER, uTint * uDay), 1.0);
        return;
    }

    // Optical geometry.
    float localX;
    float cellWidth;
    float cellIndex;
    float opticalMask;

    getOpticalInfo(
        uv.x,
        localX,
        cellWidth,
        cellIndex,
        opticalMask
    );

    // Nearest invisible edge.
    float nearestEdge;
    float edgeDistance;

    getNearestEdge(
        uv.x,
        nearestEdge,
        edgeDistance
    );

    // Edge energy concentration.
    float edgeEnergy = getEdgeEnergy(edgeDistance);

    // Optical light transformation.
    vec3 opticalColor = getOpticalLight(
        uv,
        localX,
        cellWidth,
        cellIndex,
        opticalMask
    );

    // Reduce original light intensity.
    float originalLight = getLight(uv);
    float transformedLight = getLight(
        uv + vec2(
            (localX - 0.5) * cellWidth * 0.22 * opticalMask,
            0.0
        )
    );

    // Keep the light field continuous across the whole image.
    float finalLight = transformedLight * edgeEnergy;

    // Preserve the optical color response while concentrating
    // the original light toward the invisible boundaries.
    vec3 finalColor = background;

    finalColor += opticalColor * edgeEnergy;

    // Vertical light column emitted by the edge.
    float edgeGlow = getEdgeGlow(
        uv,
        nearestEdge,
        edgeDistance
    );

    // The edge itself is the brightness peak.
    // No edge fade or board visibility mask.
    // + GLOW: this was vec3(edgeGlow * 0.85), plain white, which read as grey smoke.
    // It now has the light's colour: the blue of the reflections (0.52, 0.72, 0.88)
    // where it is faint, turning white only where it is strongest.
    finalColor += mix(
        vec3(0.52, 0.72, 0.88),
        vec3(1.0),
        edgeGlow * edgeGlow
    ) * edgeGlow * 0.85;

    // A small amount of the original light remains visible.
    finalColor += vec3(originalLight * 0.12);

    // + LOOK: everything above is the invisible board, exactly as written.
    // The two other looks are made from that finished light field, with the terms and numbers
    // the two earlier boards used (edge structure, activated highlights, glass face, glint,
    // raw light in the gaps). Edge lines are 0.0016 of the canvas wide whatever the board's width.
    if (uLook > 0.5) {
        // How much light is around this point: the light drawn here, the column the edge throws
        // up and down, and the light seen through the board (uBend may have thrown it here from aside).
        float around = clamp(originalLight + edgeGlow + opticalColor.g, 0.0, 1.0);

        float activation = smoothstep(0.008, 0.30, around);

        if (uLook < 1.5) {
            // EDGES ONLY: a line on every edge the light already reacts to (edgeDistance),
            // so a line always sits where the light peaks.
            float edgeLine = exp(-pow(edgeDistance / 0.0016, 2.0));

            // Persistent glass edge structure
            finalColor += vec3(0.012, 0.025, 0.042) * edgeLine;

            // Activated specular highlights
            finalColor += vec3(0.30, 0.43, 0.56)
                * edgeLine * activation * 0.55;

        } else if (opticalMask < 0.5) {
            // VISIBLE BOARD, gaps: the light with nothing in front of it. Same light, same
            // colours as on a board (opticalColor: off the boards its shift and dispersion
            // are zero), only not gathered toward the edges and with no column from them.
            finalColor = opticalColor;

        } else {
            // VISIBLE BOARD, on a board: the light field above, plus the glass itself.
            float centered = localX * 2.0 - 1.0;
            float face = 1.0 - centered * centered;

            float glintPosition =
                0.24 +
                0.12 * sin(uTime * 0.45 + cellIndex * 1.9);

            float glint = exp(
                -pow((localX - glintPosition) / 0.075, 2.0)
            );

            // Board edges
            float edgeLeft =
                exp(-pow(localX * cellWidth / 0.0016, 2.0));

            float edgeRight =
                exp(-pow((1.0 - localX) * cellWidth / 0.0016, 2.0));

            float edges = edgeLeft + edgeRight;

            // Dark glass base (0.009, 0.014, 0.027) over the background
            vec3 glass = vec3(0.005, 0.007, 0.013);

            glass += vec3(0.006, 0.012, 0.021) * face;

            glass += vec3(0.012, 0.025, 0.042) * edges;

            glass += vec3(0.30, 0.43, 0.56)
                * edges * activation * 0.55;

            glass += vec3(0.38, 0.48, 0.58)
                * glint * activation * 0.15;

            glass += vec3(0.52, 0.72, 0.88)
                * glint * pow(around, 1.4) * 0.32;

            // Render the board only around the light trail. Only the glass comes and goes
            // with it: the light is left alone, so it fades the same on a board as in a gap
            // (a board used to switch off, light and all, before the light had gone).
            float boardVisibility = smoothstep(0.0, 0.10, around);

            finalColor += glass * boardVisibility;
        }
    }

    // + COLOR: with a palette picked, recolour everything the light added to the background.
    // With uTint 0 this block does not run and the light is exactly as written above.
    if (uTint > 0.5) {
        vec3 lit = max(finalColor - background, vec3(0.0));

        vec3 tint = paletteAt(uv);

        // One amount for all three channels. The light's own blue-white balance and its red / blue
        // fringes are left out: multiplied into a pale colour they pull it off its hue (muddy).
        float amount = max(lit.r, max(lit.g, lit.b));

        if (uDay > 0.5) {
            // Day: white paper, and the light stains it toward the palette colour.
            // At full strength it IS the palette colour and never any darker: a wash, not ink.
            // (The gain is high because a pale colour is close to the paper: at half strength
            // it would be all but invisible.)
            finalColor = mix(
                PAPER,
                tint,
                clamp(amount * 2.0, 0.0, 1.0)
            );
        } else {
            // Night: the light in the palette colour. At full strength it IS the palette colour;
            // no burning to white (a pale colour is mostly white already).
            // A pale colour turned down is a dim grey. So the dimmer the light, the deeper its
            // colour (twice as far from white at the faintest): faint light stays a colour.
            float a = clamp(amount * 1.5, 0.0, 1.0);
            vec3 deep = max(1.0 - (1.0 - tint) * 2.0, vec3(0.0));

            finalColor =
                background +
                mix(deep, tint, a) * a;
        }
    }

    gl_FragColor = vec4(finalColor, 1.0);
}`,
  'buf-move': String.raw`#ifdef GL_ES
precision highp float;
#endif

uniform vec2 uResolution;
uniform vec3 uMouse;
uniform float uDeltaTime;
uniform float uTime;
uniform int uFrameCount;
uniform sampler2D uChannel0;

//@brush

// + DRAG: how much the mark resists the wind. 0 = carried along, as written. 1 = it stays where it was put.
uniform float uDrag;

// --------------------------------------------------
// 1. PARAMETERS
// --------------------------------------------------

const float WIND_DURATION = 0.90;
const float LIGHT_DECAY = 0.85;

// Residual fragment cleanup
const float TRAIL_CUTOFF = 0.008;
const float TRAIL_SOFT_END = 0.016;
const float TRAIL_MINIMUM = 0.001;

// --------------------------------------------------
// 2. STATE
// --------------------------------------------------

vec2 stateUV() {
    return vec2(0.5) / uResolution;
}

// --------------------------------------------------
// 3. BRUSH DISTANCE
// --------------------------------------------------

float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;

    float h = clamp(
        dot(p - a, ab) /
        max(dot(ab, ab), 0.000001),
        0.0,
        1.0
    );

    return length(p - a - ab * h);
}

// --------------------------------------------------
// 4. BRUSH WIDTH VARIATION
// --------------------------------------------------

float brushWidthVariation(float t) {
    float a = sin(
        t * 4.0 - uTime * 0.35
    );

    float b = sin(
        t * 7.0 + uTime * 0.22 + 1.7
    );

    return 1.0 + a * 0.12 + b * 0.05;
}

// --------------------------------------------------
// 5. WIND FIELD
// --------------------------------------------------

vec2 getWindVelocity(vec2 p, float time) {

    float phaseA =
        p.x * 1.25 +
        p.y * 1.85 -
        time * 0.28;

    float phaseB =
        p.x * 3.2 -
        p.y * 1.45 +
        time * 0.19;

    float gust =
        0.85 +
        0.15 * sin(
            p.y * 2.0 +
            p.x * 0.5 +
            time * 0.35
        );

    vec2 curl = vec2(
        0.018 * 1.85 * cos(phaseA)
        - 0.008 * 1.45 * cos(phaseB),

        -0.018 * 1.25 * cos(phaseA)
        - 0.008 * 3.2 * cos(phaseB)
    );

    // + DRAG: "* (1.0 - uDrag)" is the only change here.
    return (vec2(0.30 * gust, 0.0) + curl) * (1.0 - uDrag);
}

// --------------------------------------------------
// 6. AGE-BASED WIND ENVELOPE
// --------------------------------------------------

float windEnvelope(float age) {
    return 1.0 - smoothstep(
        0.0,
        WIND_DURATION,
        age
    );
}

// --------------------------------------------------
// 7. READ TRAIL PIXELS
// --------------------------------------------------

vec4 readTrailPixel(vec2 pixel) {

    vec2 index = clamp(
        pixel,
        vec2(0.0),
        uResolution - vec2(1.0)
    );

    // Reserve bottom-left pixel for mouse state
    if (index.x < 0.5 && index.y < 0.5) {
        return vec4(0.0);
    }

    vec2 sampleUV =
        (index + 0.5) / uResolution;

    return texture2D(
        uChannel0,
        sampleUV
    );
}

// --------------------------------------------------
// 8. BILINEAR TRAIL SAMPLING
// --------------------------------------------------

vec4 sampleTrailLinear(vec2 uv) {

    uv = clamp(
        uv,
        vec2(0.0),
        vec2(1.0)
    );

    vec2 pixelPosition =
        uv * uResolution - 0.5;

    vec2 base = floor(pixelPosition);
    vec2 f = fract(pixelPosition);

    vec4 c00 = readTrailPixel(base);

    vec4 c10 = readTrailPixel(
        base + vec2(1.0, 0.0)
    );

    vec4 c01 = readTrailPixel(
        base + vec2(0.0, 1.0)
    );

    vec4 c11 = readTrailPixel(
        base + vec2(1.0, 1.0)
    );

    vec4 bottom = mix(c00, c10, f.x);
    vec4 top = mix(c01, c11, f.x);

    return mix(bottom, top, f.y);
}

// --------------------------------------------------
// 9. RECOVER TRAIL AGE
// --------------------------------------------------

float getTrailAge(vec4 data) {

    // + LAYERS: the age belongs to the moving layer, which is now in blue
    // (red is what is shown: moving light over settled light). This was data.r.
    if (data.b < 0.00001) {
        return 0.0;
    }

    // G stores premultiplied age
    return data.g / data.b;
}

// + FADE: how much of its light a point keeps over dt. This was exp(-LIGHT_DECAY * dt), the
// same everywhere, so a whole mark dimmed evenly like a layer turned down. Now faint light
// goes faster than bright light: a mark narrows from its rim inwards and its grain goes out
// speck by speck, while the bright middle stays a little longer. A slow uneven field keeps
// it from thinning everywhere at once.
float fadeOf(float amount, vec2 p, float dt) {
    float thin = 1.0 - smoothstep(0.0, 0.45, amount);

    float uneven =
        1.0 +
        0.28 * sin(p.x * 9.0 + p.y * 6.0 - uTime * 0.40)
             * sin(p.y * 11.0 - p.x * 4.0 + uTime * 0.30);

    return exp(
        -LIGHT_DECAY * (0.65 + 0.95 * thin) * uneven * dt
    );
}

// --------------------------------------------------
// 10. TIME-LIMITED ADVECTION
// --------------------------------------------------

vec4 advectTrail(vec2 uv, float dt) {

    float aspect =
        uResolution.x / uResolution.y;

    vec2 p = vec2(
        uv.x * aspect,
        uv.y
    );

    // Initial age estimate
    vec4 initialData =
        sampleTrailLinear(uv);

    float initialAge =
        getTrailAge(initialData);

    float initialWeight = windEnvelope(
        initialAge + dt * 0.5
    );

    // First RK2 velocity
    vec2 v1 =
        getWindVelocity(p, uTime) *
        initialWeight;

    vec2 midpoint =
        p - v1 * dt * 0.5;

    vec2 v2 =
        getWindVelocity(
            midpoint,
            uTime - dt * 0.5
        ) * initialWeight;

    vec2 firstPreviousPosition =
        p - v2 * dt;

    vec2 firstPreviousUV = vec2(
        firstPreviousPosition.x / aspect,
        firstPreviousPosition.y
    );

    // Refine age estimate
    vec4 firstSource =
        sampleTrailLinear(firstPreviousUV);

    float sourceAgeGuess =
        getTrailAge(firstSource);

    float refinedWeight = windEnvelope(
        sourceAgeGuess + dt * 0.5
    );

    // Recalculate backtrace
    v1 =
        getWindVelocity(p, uTime) *
        refinedWeight;

    midpoint =
        p - v1 * dt * 0.5;

    v2 =
        getWindVelocity(
            midpoint,
            uTime - dt * 0.5
        ) * refinedWeight;

    vec2 previousPosition =
        p - v2 * dt;

    vec2 previousUV = vec2(
        previousPosition.x / aspect,
        previousPosition.y
    );

    // Canvas boundary protection
    float boundaryMask =
        smoothstep(
            -0.015,
            0.005,
            previousUV.x
        ) *
        (1.0 - smoothstep(
            0.995,
            1.015,
            previousUV.x
        )) *
        smoothstep(
            -0.015,
            0.005,
            previousUV.y
        ) *
        (1.0 - smoothstep(
            0.995,
            1.015,
            previousUV.y
        ));

    // Actual previous-frame source
    vec4 source =
        sampleTrailLinear(previousUV);

    float sourceAge =
        getTrailAge(source);

    // Energy decay without spatial diffusion
    // + FADE: this was exp(-LIGHT_DECAY * dt). See fadeOf().
    float energyDecay = fadeOf(source.b, p, dt);

    // + LAYERS: the moving layer is in blue. This was source.r.
    float light =
        source.b *
        energyDecay *
        boundaryMask;

    float age = min(
        sourceAge + dt,
        10.0
    );

    if (light < 0.000001) {
        return vec4(0.0);
    }

    // Return light and unpremultiplied age
    return vec4(
        light,
        age,
        0.0,
        0.0
    );
}

// --------------------------------------------------
// 11. MAIN
// --------------------------------------------------

void main() {

    vec2 uv =
        gl_FragCoord.xy / uResolution;

    float dt = clamp(
        uDeltaTime,
        0.0,
        0.05
    );

    // --------------------------------------------------
    // MOUSE STATE
    // --------------------------------------------------

    vec4 oldState = texture2D(
        uChannel0,
        stateUV()
    );

    vec2 previous = oldState.rg;
    float previousValid = oldState.b;

    vec2 current =
        uMouse.xy / uResolution;

    float currentValid =
        step(0.0001, current.x) *
        step(0.0001, current.y) *
        (1.0 - step(1.0, current.x)) *
        (1.0 - step(1.0, current.y));

    if (
        uFrameCount <= 1 ||
        previousValid < 0.5
    ) {
        previous = current;
    }

    // --------------------------------------------------
    // ASPECT-CORRECT COORDINATES
    // --------------------------------------------------

    float aspect =
        uResolution.x / uResolution.y;

    vec2 p = vec2(
        uv.x * aspect,
        uv.y
    );

    vec2 a = vec2(
        previous.x * aspect,
        previous.y
    );

    vec2 b = vec2(
        current.x * aspect,
        current.y
    );

    vec2 ab = b - a;

    float segmentT = clamp(
        dot(p - a, ab) /
        max(dot(ab, ab), 0.000001),
        0.0,
        1.0
    );

    float movement = distance(a, b);

    // --------------------------------------------------
    // ADVECT OLD LIGHT
    // --------------------------------------------------

    vec4 advected =
        advectTrail(uv, dt);

    float oldLight = advected.r;
    float oldAge = advected.g;

    // --------------------------------------------------
    // BRUSH SHAPE
    // --------------------------------------------------

    float d = segmentDistance(
        p,
        a,
        b
    );

    float widthFactor =
        brushWidthVariation(segmentT);

    float coreWidth =
        0.0132 * widthFactor;

    float haloWidth =
        0.0100 * widthFactor;

    float core = exp(
        -pow(d / coreWidth, 2.0)
    );

    float halo = exp(
        -pow(d / haloWidth, 2.0)
    );

    // --------------------------------------------------
    // ORGANIC CONCENTRATION
    // --------------------------------------------------

    float flowA = sin(
        segmentT * 18.0 -
        uTime * 1.2 +
        uv.x * 7.0
    );

    float flowB = sin(
        segmentT * 31.0 +
        uTime * 0.7 -
        uv.y * 9.0
    );

    float flowC = sin(
        segmentT * 9.0 -
        uTime * 0.45 +
        uv.x * 3.0 +
        uv.y * 4.0
    );

    float concentration =
        0.78 +
        flowA * 0.09 +
        flowB * 0.045 +
        flowC * 0.08;

    concentration = clamp(
        concentration,
        0.48,
        1.0
    );

    core *= concentration;

    halo *=
        0.85 +
        concentration * 0.15;

    // --------------------------------------------------
    // NEW LIGHT INJECTION
    // --------------------------------------------------

    float moving =
        currentValid *
        previousValid *
        smoothstep(
            0.00008,
            0.0010,
            movement
        );

    float newLight =
        (core * 0.72 + halo * 0.18) *
        moving;

    // + BRUSH: uBrush 0 = the line above, as written.
    //   1 = the line above with a brush's texture on it (the brush mark only masks it).
    //   2 = a whole brush instead of the line: where its tip passed this frame, the moving
    //       light is topped up to the brush's mark. Topped up, not added: a tip that lingers
    //       or comes back does not pile light on what it has already put there.
    if (uBrush > 1.5) {
        newLight = max(
            brushLight(uv) * brushCover(uv) - oldLight,
            0.0
        );
    } else if (uBrush > 0.5) {
        newLight *= brushLight(uv);
    }

    // --------------------------------------------------
    // COMBINE OLD AND NEW LIGHT
    // --------------------------------------------------

    float totalLight =
        oldLight + newLight;

    // Prevent brightness overflow
    float rawTrail = clamp(
        totalLight,
        0.0,
        1.0
    );

    // --------------------------------------------------
    // RESIDUAL FRAGMENT CLEANUP
    // Apply only once per frame
    // --------------------------------------------------

    float cleanup = smoothstep(
        TRAIL_CUTOFF,
        TRAIL_SOFT_END,
        rawTrail
    );

    float trail =
        rawTrail * cleanup;

    // --------------------------------------------------
    // COMBINE AGE DATA
    // New light has age zero
    // --------------------------------------------------

    float combinedAge = 0.0;

    if (totalLight > 0.00001) {
        combinedAge =
            oldLight * oldAge /
            totalLight;
    }

    // Store age multiplied by current light
    float storedAge =
        trail * combinedAge;

    // Remove both channels together
    if (trail < TRAIL_MINIMUM) {
        trail = 0.0;
        storedAge = 0.0;
    }

    // --------------------------------------------------
    // + LAYERS
    // --------------------------------------------------

    // Everything above is the MOVING layer: light the wind still carries. Light that has
    // stopped (WIND_DURATION old) is put down on a second, SETTLED layer that nothing moves.
    // Kept in one layer the two got in each other's way: a point holding stopped light would
    // not let moving light in, so an old mark cut across a new one as if it lay in front;
    // and taking the old light away under a new mark left a hole in the old mark once the
    // new one had drifted on or faded.
    // What is shown is moving light OVER settled light. Settled light is hidden only where
    // moving light lies on it, and is still there when that moves on.
    float settled = texture2D(uChannel0, uv).a;

    settled *= fadeOf(settled, p, dt);

    settled *= smoothstep(
        TRAIL_CUTOFF,
        TRAIL_SOFT_END,
        settled
    );

    if (settled < TRAIL_MINIMUM) {
        settled = 0.0;
    }

    // The moving light here has stopped: lay it on top of what settled before it.
    // (What is shown does not change at this moment; see "shown" below.)
    if (combinedAge >= WIND_DURATION) {
        settled =
            trail +
            settled * (1.0 - clamp(trail / 0.72, 0.0, 1.0));

        trail = 0.0;
        storedAge = 0.0;
    }

    float shown = clamp(
        trail +
        settled * (1.0 - clamp(trail / 0.72, 0.0, 1.0)),
        0.0,
        1.0
    );

    // --------------------------------------------------
    // STORE STATE
    // --------------------------------------------------

    bool statePixel =
        gl_FragCoord.x < 1.0 &&
        gl_FragCoord.y < 1.0;

    if (statePixel) {

        gl_FragColor = vec4(
            current,
            currentValid,
            1.0
        );

    } else {

        // + LAYERS: this was (trail, storedAge, 0.0, 1.0).
        // Red: what is shown, the only thing the image reads. Green: the moving layer's age,
        // as before. Blue: the moving layer. Alpha: the settled layer.
        gl_FragColor = vec4(
            shown,
            storedAge,
            trail,
            settled
        );

    }
}`,
};
