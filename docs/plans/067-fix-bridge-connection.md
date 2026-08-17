The overall architecture is good. The problem is **not GSAP/ScrollTrigger**. The main problems are in the **geometry, timeline synchronization, and connector calculation**.


---

# 1. Your biggest issue: the cards don't have the same geometry as the reference

Look at your current cards:

* very long rectangular top
* extremely prominent left side
* very thin bottom side
* perspective feels like the card is **tilting away**
* reference looks more like a **floating isometric slab**

Your current:

```ts
const ISO = { rotateX: 58, rotateZ: 45 };
```

isn't necessarily wrong.

The problem is that **rotation is being applied to whatever dimensions your underlying card has**.

You want the underlying card to be approximately **square**.

For example:

```css
.hub-bridge-card {
  width: 320px;
  height: 320px;

  transform-style: preserve-3d;
  transform-origin: center center;
}
```

Then let GSAP apply:

```ts
rotateX: 58,
rotateZ: 45,
```

The square gets projected into the isometric-looking diamond/parallelogram.

If your source card is something like:

```css
width: 360px;
height: 220px;
```

you will get exactly the stretched appearance you're currently seeing.

### So first check this.

Your **source geometry should be square**.

---

# 2.  separate "card geometry" from "animation geometry"

Right now your `restPose()` contains:

```ts
rotateX: ISO.rotateX,
rotateZ: ISO.rotateZ,
```

That's okay, but I'd make the distinction clearer.

### Static geometry

```ts
const ISO = {
  rotateX: 58,
  rotateZ: 45,
};
```

### Animation

```ts
x
y
z
scale
```

That way the card's actual orientation doesn't change during the story.

You want:

```text
                 SAME ORIENTATION
                       ↓

        ┌───────────┐
       /           /|
      /           / |
     └───────────┘  |
      \           \ |
       └───────────┘

        ↓ ↓ ↓

Only position/depth/color changes
```

Your screenshots currently look like the cards are changing geometry more than they should.

---

# 3. connector timing is definitely wrong

This is a real bug in your code.

Your animation stages are:

```ts
0 → 1     Candidates
1 → 2     ABTalks
2 → 3     Companies
3 → 4     Hold
```

Because the timeline has four equal units, that means:

```text
0%       candidates
25%      ABTalks
50%      companies
75%      hold
100%
```

But your connector says:

```ts
function connectorKind(progress: number) {
  if (progress < 0.08) return null;
  if (progress < 0.375) return "candidates";
  if (progress < 0.625) return "abtalks";
  return "companies";
}
```

You're switching at:

```text
8%
37.5%
62.5%
```

instead of:

```text
0%
25%
50%
75%
```

So your connector and your cards are **out of sync**.

That's visible in the screenshots.

---

# 4. Fix the connector stages

At minimum:

```ts
function connectorKind(progress: number): BridgeStoryKey | null {
  if (progress < 0.08) return null;
  if (progress < 0.375) return "candidates";
  if (progress < 0.625) return "abtalks";
  if (progress < 0.875) return "companies";
  return "companies";
}
```

But honestly, I wouldn't hard-code these percentages.

### Better approach

Add labels to your GSAP timeline:

```ts
const tl = gsap.timeline({
  ...
});

tl.addLabel("candidates", 0);
tl.addLabel("abtalks", 1);
tl.addLabel("companies", 2);
tl.addLabel("hold", 3);
```

Then your timeline has an explicit semantic structure.

Even better, calculate connector progress based on the timeline's actual progress rather than maintaining two separate systems.

---

# 5. Your `connectorPath()` is also causing the strange lines

This:

```ts
if (kind === "candidates") {
  const mid = x0 + (x1 - x0) * 0.55;
  return `M ${x0} ${y0} L ${mid} ${y0} L ${x1} ${y0}`;
}
```

is literally creating:

```text
Card ───────────────────── Text
```

That's why the candidate screenshot has a completely horizontal connector.

But your intended design is more like:

```text
                ┌──────────────
               /
              /
        CARD
```

So I'd change it to:

```ts
if (kind === "candidates") {
  const midX = x0 + (x1 - x0) * 0.55;

  return `
    M ${x0} ${y0}
    L ${midX} ${y1}
    L ${x1} ${y1}
  `;
}
```

That gives you:

```text
Card
  \
   \
    └────────────────── Text
```

which is much closer to your screenshots.

---

# 6. But there is a bigger connector problem

You're calculating the connector every scroll update:

```ts
onUpdate(self) {
  updateConnector(stage, cards, copies, svgPath, self.progress);
}
```

and inside:

```ts
card.getBoundingClientRect()
copy.getBoundingClientRect()
```

That's potentially expensive.

You're effectively doing:

```text
scroll
 ↓
GSAP update
 ↓
getBoundingClientRect()
 ↓
layout measurement
 ↓
SVG calculation
 ↓
DOM update
```

on every scrub update.

For three cards it may still work, but I wouldn't architect a premium site this way.

---

# 7. More importantly: you're measuring transformed elements

This is the subtle issue.

`getBoundingClientRect()` gives you the **post-transform visual rectangle**.

Your cards are being transformed with:

```ts
rotateX
rotateZ
z
scale
```

So the bounding rectangle changes dramatically.

That means your connector anchor:

```ts
const x0 = cr.left + cr.width * 0.72;
const y0 = cr.top + cr.height * 0.48;
```

is not actually a stable point on your card.

That's why the connector can appear to "jump".

---

# 8. Use a dedicated anchor on the card

This is what I'd do professionally.

Inside each card:

```html
<div class="hub-bridge-card">
    <div class="hub-bridge-card-top"></div>

    <div
      class="hub-bridge-anchor"
      data-bridge-anchor="candidates"
    />
</div>
```

Then:

```css
.hub-bridge-anchor {
  position: absolute;

  left: 72%;
  top: 48%;

  width: 1px;
  height: 1px;
}
```

Now you're explicitly saying:

> "This is the point from which the connector emerges."

Much better than:

```ts
cr.left + cr.width * .72
```

---

# 9. Your active-card movement is too aggressive

You currently have:

```ts
riseY: -52,
riseZ: 180,
riseX: 40,
```

The `z: 180` combined with:

```ts
perspective
rotateX
rotateZ
```

is producing a fairly dramatic projection.

That's why your active card looks like it's flying toward the camera.

I'd initially try:

```ts
const DESKTOP: Geo = {
  y: [168, 0, -168],

  riseY: -35,
  riseZ: 90,
  riseX: 25,

  compress: 28,

  scaleActive: 1.03,
  scaleIdle: 0.98,

  scrollEnd: "+=400%",
};
```

Then tune from there.

**Don't try to solve the visual mismatch with `scale`.**

Depth should primarily come from:

```text
z
shadow
position
```

not:

```text
huge scale
```

---

# 10. Your cards are too separated vertically

You're using:

```ts
y: [168, 0, -168]
```

So:

```text
Card 3
   ↑ 168px

Card 2
   ↓ 168px

Card 1
```

Combined with the 3D projection, this becomes a very large visual gap.

Your screenshots show a much tighter relationship.

Try:

```ts
y: [125, 0, -125]
```

and then use the active card's Z movement to create the perceived separation.

I'd start around:

```ts
y: [130, 0, -130]
```

rather than 168.

---

# 11. Your idle compression logic is slightly backwards

Look at:

```ts
.to(cards[1], {
  ...idlePose(geo, 1, -geo.compress),
})
```

and:

```ts
.to(cards[2], {
  ...idlePose(geo, 2, -geo.compress * 0.45),
})
```

You're manually moving different cards with arbitrary multipliers.

That works initially, but it becomes difficult to maintain.

I'd define a **stage layout**.

For example:

```ts
const STAGES = {
  candidates: [130, 15, -145],
  abtalks: [145, 0, -145],
  companies: [145, -15, -130],
};
```

Then the animation becomes:

```text
Candidates
   ↓
[active]   y = 130
[idle]     y = 15
[idle]     y = -145

ABTalks
   ↓
[idle]     y = 145
[active]   y = 0
[idle]     y = -145

Companies
   ↓
[idle]     y = 145
[idle]     y = -15
[active]   y = -130
```

Much easier to tune against the screenshots.

---

# 12. There's another important issue: your screenshot appears to be at the wrong scroll stage

Your screenshot showing:

> FOR THE CANDIDATES

has the bottom card active.

That part is correct.

But the next screenshot:

> THE BRIDGE / ABTalks

has the **middle card active**.

And the third:

> FOR THE COMPANIES

has the **top card active**.

That's exactly the story you want.

So your state machine is correct:

```text
BOTTOM
  ↓
MIDDLE
  ↓
TOP
```

**Do not rewrite the whole animation.**

The architecture is right.

You need to fix the visual interpolation between those states.

---

# 13. Your copy animation is actually pretty good

This:

```ts
.to(copies[0], {
  opacity: 1,
  y: 0,
  duration: 0.55
}, 0.2)
```

and:

```ts
.to(copies[1], {
  opacity: 1,
  y: 0,
  duration: 0.55
}, 1.15)
```

is a good pattern.

I'd keep it.

But I would change:

```ts
y: 16
```

to maybe:

```ts
y: 24
```

and use:

```ts
ease: "power2.out"
```

for copy rather than the same:

```ts
power3.inOut
```

as the cards.

Cards and typography shouldn't necessarily have identical motion curves.

---

# 14. One thing you're doing correctly

This is good:

```ts
use gsap.context()
```

assuming your React component wraps `createBridgeTimeline()` appropriately.

And this is good:

```ts
invalidateOnRefresh: true
```

And this is also good:

```ts
gsap.matchMedia()
```

for responsive geometries.

Your overall engineering direction is solid.

---

# 15. I would change your desktop geometry to this first

Don't use this as the final answer. Use it as a **baseline for the next visual test**:

```ts
const DESKTOP: Geo = {
  y: [130, 0, -130],

  riseY: -35,
  riseZ: 95,
  riseX: 25,

  compress: 26,

  scaleActive: 1.03,
  scaleIdle: 0.98,

  scrollEnd: "+=400%",
};
```

And:

```ts
const ISO = {
  rotateX: 58,
  rotateZ: 45,
};
```

Keep that for now.

---

# 16. Then fix your connector

I'd change the candidates branch to:

```ts
if (kind === "candidates") {
  const midX = x0 + (x1 - x0) * 0.55;

  return `
    M ${x0} ${y0}
    L ${midX} ${y1}
    L ${x1} ${y1}
  `;
}
```

And make the other two consistent:

```ts
if (kind === "abtalks") {
  const midX = x0 + (x1 - x0) * 0.38;

  return `
    M ${x0} ${y0}
    L ${midX} ${y1}
    L ${x1} ${y1}
  `;
}

const midX = x0 + (x1 - x0) * 0.42;

return `
  M ${x0} ${y0}
  L ${midX} ${y1}
  L ${x1} ${y1}
`;
```

---

# 17. And fix the connector stage boundaries

Use:

```ts
function connectorKind(progress: number): BridgeStoryKey | null {
  if (progress < 0.05) return null;

  if (progress < 0.375) {
    return "candidates";
  }

  if (progress < 0.625) {
    return "abtalks";
  }

  if (progress < 0.90) {
    return "companies";
  }

  return "companies";
}
```

Actually, even better would be to make the connector switch **during the card transition**, rather than at a hard boundary.

That's the next refinement.

---

# 18. One thing I would NOT change yet

Don't start using:

```text
Three.js
React Three Fiber
WebGL
Spline
```

to solve this.

Your current result proves that the CSS/GSAP approach is capable of producing the basic effect.

The issue is **calibration**, not technology.

The Vision Fund reference itself is fundamentally about using motion to reinforce the content/story; the current site similarly uses large visual transitions and structured content rather than requiring every element to be a WebGL scene. ([SoftBank Vision Fund][1])

---

# The order I'd fix your implementation

Don't change 15 things simultaneously.

### Step 1 — Fix card geometry

Make the underlying card **square**.

### Step 2 — Reduce depth

```ts
riseZ: 95
```

instead of `180`.

### Step 3 — Tighten stack

```ts
y: [130, 0, -130]
```

### Step 4 — Reduce active scale

```ts
1.03
```

### Step 5 — Fix connector geometry

Make it:

```text
CARD
  \
   \
    └────────────── TEXT
```

### Step 6 — Fix connector/card synchronization

Make the connector state follow the same stage boundaries as the timeline.

### Step 7 — Only then tune shadows/colors/text.

---

## And honestly: you're much closer than it looks.

Your screenshots already show the **correct conceptual animation**:

**bottom slab → middle slab → top slab**

and:

**candidate → ABTalks → companies**

That's the hard architectural part.

What's currently missing is the **art direction calibration** — geometry, perspective, spacing, depth, and connector anchoring.

