Create a bridge section exactly by following the steps
# Important
This bridge section will lie on the left half of the bridge section and other half will be the content that it points to 

# 1. First understand what you're actually building
.

### State 1 — Initial

```text
             ┌──────────────┐
            /              /|
           /              / |
          └──────────────┘  |
                 ↓
             ┌──────────────┐
            /              /|
           /              / |
          └──────────────┘
                 ↓
             ┌──────────────┐
            /              /|
           /              / |
          └──────────────┘
```

Three floating white layers.

---

### State 2 — "For Candidate"

The bottom layer becomes highlighted.

```text
       WHITE
          ↓
       WHITE

                    ────────────────
                   /
                  /
        ┌───────────────┐
       /    Candidate  /
      └───────────────┘
```

---

### State 3 — "The Bridge"

The middle layer becomes highlighted and moves forward.

```text
       WHITE

                   ───────────────
                  /
       ┌────────────────┐
      /    ABTalks     /
     └────────────────┘

       WHITE
```

---

### State 4 — "For Companies"

The upper layer becomes highlighted.

```text
       ┌────────────────┐
      /   Companies     /
     └────────────────┘
             │
             └────────────────────

              WHITE

              WHITE
```

So you're really creating:

> **One 3D scene → controlled by scroll position → passing through several narrative states.**

That distinction is extremely important.

---

# 2. The technology I would use

GSAP
GSAP ScrollTrigger
CSS
```


You **do not need Three.js** for this particular effect.

That's important.

Your "3D" is actually mostly:

```css
transform:
  perspective()
  translate3d()
  rotateX()
  rotateY()
  scale()
```

combined with shadows.


# 3. Don't start with animation

This is where most developers make a mistake.

First build the **static 3D object**.

Your HTML should conceptually look like:

```text
Scene
│
├── Layer 1
├── Layer 2
├── Layer 3
│
├── Connector line
│
└── Text
```

In React:

```tsx
<div className="scene">

  <div className="stack">
    <div className="card card-1" />
    <div className="card card-2" />
    <div className="card card-3" />
  </div>

  <div className="connector" />

  <div className="label">
    Will it?
  </div>

</div>
```



# 4. Create the 3D card

This is the most important part.

You don't actually need a 3D model.

Create a diamond/parallelogram-looking top surface using CSS transforms.

For example:

```css
.scene {
  perspective: 1400px;
}

.card {
  position: absolute;

  width: 320px;
  height: 220px;

  background: #fdfdfc;

  transform:
    rotateX(58deg)
    rotateZ(45deg);

  transform-style: preserve-3d;

  box-shadow:
    0 35px 50px rgba(0,0,0,0.08);
}
```

But there's one problem:

A real 3D slab has thickness.

So I'd actually make:

```tsx
<div className="card">
  <div className="card-top" />
  <div className="card-front" />
  <div className="card-side" />
</div>
```

Then:

```css
.card-top {
  position: absolute;
  inset: 0;
}

.card-front {
  position: absolute;

  left: 0;
  bottom: -18px;

  width: 100%;
  height: 18px;
}

.card-side {
  position: absolute;

  right: -25px;
  bottom: -9px;

  width: 25px;
  height: 18px;
}
```

This gives you the physical "block" appearance from your screenshots.

---

# 5. But there's an even better approach

For this particular design, I would use **CSS clip-path polygons** for the visible sides.

You can create:

```text
                 TOP
              /       \
             /         \
            /           \
            ─────────────
            SIDE
```

For example:

```css
.card::before {
  content: "";

  position: absolute;

  inset: 0;

  background: #ffffff;

  clip-path: polygon(
    50% 0%,
    100% 50%,
    50% 100%,
    0% 50%
  );
}
```

Then construct the thickness underneath.

This gives you much more control over the exact geometry.

---

# 6. Establish a coordinate system

This is where professional implementation differs from "just make it move".

You need a **scene coordinate system**.

I'd create:

```css
.scene {
  position: relative;

  width: 100%;
  height: 100vh;

  overflow: hidden;

  perspective: 1600px;
}

.scene-inner {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 500px;
  height: 500px;

  transform:
    translate(-50%, -50%)
    rotateX(...);
}
```

Everything lives inside `.scene-inner`.

That means:

```text
                 Scene
                   │
              Scene Inner
                   │
        ┌──────────┼──────────┐
        │          │          │
      Card 1     Card 2     Card 3
```

Now you can move the **whole composition** without destroying the individual positions.

---

# 7. Position the three cards

Initially:

```text
Card 3

Card 2

Card 1
```

Something like:

```css
.card-1 {
  transform: translate3d(0, 180px, 0)
             rotateX(58deg)
             rotateZ(45deg);
}

.card-2 {
  transform: translate3d(0, 0px, 0)
             rotateX(58deg)
             rotateZ(45deg);
}

.card-3 {
  transform: translate3d(0, -180px, 0)
             rotateX(58deg)
             rotateZ(45deg);
}
```

The exact values should be tuned visually.

Don't obsess over making the geometry mathematically perfect.

You're reproducing a **visual illusion**, not building CAD software.

---

# 8. Add the shadows

This is actually responsible for a huge portion of the perceived depth.

Each card should have:

```css
box-shadow:
  0 25px 35px rgba(0,0,0,.08),
  0 8px 15px rgba(0,0,0,.04);
```

But don't use identical shadows.

For example:

```text
Top card
    ↓
small shadow

Middle card
    ↓
medium shadow

Bottom card
    ↓
large shadow
```

The screenshot has very soft, diffuse shadows.

Avoid:

```css
box-shadow: 0 10px 10px #000;
```

That will immediately make it look cheap.

Use a large blur radius and low opacity.

---

# 9. Now create the connector

This part is deceptively important.

Don't use an SVG animation initially.

Create an SVG overlay:

```tsx
<svg className="connector">
  <path
    ref={pathRef}
    d="M 0 0 L 150 -170 L 500 -170"
  />
</svg>
```

CSS:

```css
.connector {
  position: absolute;

  inset: 0;

  pointer-events: none;
}

.connector path {
  fill: none;

  stroke: #e7a36f;

  stroke-width: 2;
}
```

Now you can animate:

```text
Card
  \
   \
    ─────────────────
```

The path can change depending on which card is active.

---

# 10. Then create the text

Don't put the text directly inside the card if you want it to behave independently.

Use:

```tsx
<div className="story-label">
  Candidates
</div>
```

Then position it relative to the card.

This gives you the ability to do:

```text
Card moves
      ↓
Label moves slightly differently
      ↓
Creates depth
```

That subtle difference is what makes the animation feel expensive.

---

# 11. Now comes the important part: SCROLL → PROGRESS

This is where GSAP ScrollTrigger comes in.

I'd make the section approximately:

```css
.story-section {
  height: 500vh;
}
```

Why 500vh?

Because you need enough physical scroll distance for the animation to breathe.

For example:

```text
100vh     Initial stack
200vh     Will it?
300vh     Labelbox
400vh     Uber
500vh     End
```

This is similar to the common approach of giving cinematic parallax sections several viewport heights so the motion has enough room to develop. ([Aigoose Cinematic][2])

---

# 12. Pin the visual

This is crucial.

Your page should behave like:

```text
SCROLL
   ↓
┌──────────────────────────────┐
│                              │
│       3D ANIMATION           │
│                              │
│         remains fixed        │
│                              │
└──────────────────────────────┘
   ↓
      content continues
```

GSAP:

```tsx
ScrollTrigger.create({
  trigger: section,
  start: "top top",
  end: "bottom bottom",
  pin: scene,
});
```

So the user is technically scrolling through 500vh, but visually the scene stays in place.

---

# 13. Use ONE master timeline

This is the biggest implementation recommendation I can give you.

**Don't create separate ScrollTriggers for every card.**

Create:

```text
MASTER TIMELINE

0.00
 ↓
Initial state

0.25
 ↓
Will it?

0.50
 ↓
Labelbox

0.75
 ↓
Uber

1.00
 ↓
Final state
```

Something like:

```tsx
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    scrub: 1,
    pin: scene,
  }
});
```

Then:

```tsx
tl
  .to(card1, {...})
  .to(card2, {...})
  .to(label, {...})
  .to(connector, {...});
```

This gives you a single source of truth.

---

# 14. Think of scroll as a timeline

This is the mental model you should use:

```text
SCROLL POSITION

0%
│
│   ┌───────────────┐
│   │ Initial stack │
│   └───────────────┘
│
25%
│
│   ┌───────────────┐
│   │  Candidate    │
│   └───────────────┘
│
50%
│
│   ┌───────────────┐
│   │   ABTalks     │
│   └───────────────┘
│
75%
│
│   ┌───────────────┐
│   │    Company  │
│   └───────────────┘
│
100%
│
▼
Next section
```

This is much easier to reason about than:

> "When scroll reaches 732px move this div 50px."

---

# 15. Your animation should NOT be linear

This is one of the biggest differences between amateur and premium motion.

Don't do:

```tsx
ease: "linear"
```

for everything.

Instead:

```tsx
ease: "power3.inOut"
```

or:

```tsx
ease: "expo.out"
```

for certain movements.

GSAP's timeline/keyframe approach gives you independent control over position, scale, rotation and easing, which is exactly what you need here. ([The Web Kitchen][3])

---

# 16. Animate several properties simultaneously

For example, when `Candidate` activates:

Don't just:

```text
move card
```

Do:

```text
Card
 ├── moves forward
 ├── becomes blue
 ├── increases scale slightly
 ├── shadow becomes stronger
 └── rotates subtly

Text
 ├── fades in
 ├── moves upward
 └── scales slightly

Connector
 ├── extends
 └── changes color
```

That's what creates the "story".

---

# 17. Example animation architecture

Conceptually:

```tsx
tl
  // INITIAL
  .set(candidateCard, {
    opacity: 0
  })

  //Candidate
  .to(candidateCard, {
    z: 100,
    scale: 1.05,
    backgroundColor: "#B8C9D9",
    duration: 1
  })

  .to(candidateLabel, {
    opacity: 1,
    x: 20,
    duration: .5
  }, "<")

 //ABTalks
  .to(abtalksCard, {
    z: 200,
    scale: 1.05,
    backgroundColor: "#A8A7BE",
    duration: 1
  })

  //Company
  .to(companyCard, {
    z: 300,
    scale: 1.05,
    backgroundColor: "#E9AF96",
    duration: 1
  });
```

The actual numbers would need to be tuned against your screenshots.

---

# 18. Don't animate `top`, `left`, `width`, etc.

For smoothness, use:

```css
transform: translate3d(...)
```

rather than:

```css
top: 100px;
left: 200px;
```

Your primary animation properties should be:

```text
transform
opacity
filter
```

This keeps the animation much more GPU-friendly.

---

# 19. Make the active card "rise"

Your screenshots have a very important visual cue:

The active card isn't merely changing color.

It appears to **rise above the stack**.

So implement:

```text
Normal:

       Card
       ↓
       Card
       ↓
       Card


Active:

       Card
         ↑
       Card
       ↓
       Card
```

Technically:

```tsx
z
translateY
translateZ
scale
```

all work together.

For example:

```tsx
gsap.to(card, {
  y: -80,
  z: 180,
  scale: 1.04
});
```

Because the parent has:

```css
perspective: 1400px;
```

the `translateZ()` becomes visually meaningful.

---

# 20. Then create the "depth compression"

This will make your version much closer to the reference.

When one card becomes active:

```text
ACTIVE CARD
     ↑
     │
     │ large gap
     │
────────────
inactive cards
```

Then as the story progresses:

```text
active card moves

inactive cards
     ↓
     compress
```

So you're essentially manipulating:

```text
Z-depth
+
Y-position
+
scale
```

simultaneously.

---

# 21. Make the background extremely subtle

Your screenshot has almost no visual noise.

I'd use something around:

```css
background: #faf9f7;
```

or:

```css
background: #fbfaf8;
```

Then:

```text
Cards → #FFFFFF
Shadows → black at 3–8%
Active → muted color
Text → near black
Connector → muted gradient
```

Don't introduce gradients everywhere.

The **motion itself is the visual effect**.

---

# 22. Make the connector line dynamic

I would actually make the connector respond to the active card.

For example:

```text
Candidate

Card ────────────────→ text
```

Then:

```text
ABTalks

        Card
          \
           \
            ─────────→ text
```

Then:

```text
Company

      Card
        \
         \
          ───────────→ text
```

So the line is basically:

```text
active card
     ↓
connection point
     ↓
horizontal story line
```

You can calculate this with JavaScript based on the card's bounding rectangle.

---

# 23. This is where React should stop

Don't put animation state into React like:

```tsx
const [activeCard, setActiveCard] = useState(...)
```

for every scroll event.

Avoid:

```tsx
window.addEventListener("scroll", ...)
setState(...)
```

That can cause unnecessary React renders.

Instead:

```text
React
 ↓
renders DOM

GSAP
 ↓
controls DOM animation
```

That's the architecture I'd use.

---

# 24. Recommended component structure

For your Next.js project:

```text
components/
│
├── story/
│   ├── StorySection.tsx
│   ├── StoryScene.tsx
│   ├── StoryCard.tsx
│   ├── StoryConnector.tsx
│   └── storyAnimation.ts
│
└── ui/
```

And:

```tsx
<StorySection>
   <StoryScene>
      <StoryCard />
      <StoryCard />
      <StoryCard />

      <StoryConnector />
   </StoryScene>
</StorySection>
```

This will keep your implementation maintainable.

---

# 25. Use GSAP only on the client

Since you're using Next.js:

```tsx
"use client";
```

Then:

```tsx
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);
```

And use:

```tsx
useLayoutEffect(() => {

  const ctx = gsap.context(() => {

    // animations

  }, container);

  return () => ctx.revert();

}, []);
```

The cleanup is important in Next.js/React development mode.

---

# 26. Don't start with the final animation

I would build this in **five passes**.

### Pass 1 — Geometry

Get this perfect:

```text
□
□
□
```

No animation.

---

### Pass 2 — Depth

Add:

```text
perspective
rotation
thickness
shadows
```

Until it looks almost exactly like your screenshot.

---

### Pass 3 — Scroll

Make:

```text
0 → 25 → 50 → 75 → 100%
```

change the cards.

Nothing else.

---

### Pass 4 — Storytelling

Add:

```text
labels
connector
color changes
opacity
```

---

### Pass 5 — Polish

Add:

```text
easing
micro movement
shadow changes
subtle scale
text transitions
responsive behavior
reduced motion
```

**Do not attempt all five at once.**

---

# 27. Desktop and mobile should NOT use the same geometry

This is extremely important.

Desktop:

```text
          Card

Card                  Text
```

Mobile:

```text
       Card

       Card

       Card

       Text
```

Trying to simply shrink the desktop version will probably look terrible.

Create a different composition for:

```text
Desktop ≥ 1024px
Tablet  768–1023px
Mobile  <768px
```

The animation concept remains the same, but the geometry changes.

---

# 28. Handle reduced motion

You should absolutely include:

```css
@media (prefers-reduced-motion: reduce) {
  ...
}
```

For users who have reduced motion enabled, turn the cinematic animation into a simple stacked/static presentation.

Modern motion systems should account for reduced-motion accessibility rather than assuming every user wants maximum animation. ([Invisigrid][4])

---

# 29. Performance rules I'd follow

### Do

```text
transform
opacity
will-change
GSAP
SVG
CSS shadows
```

### Avoid

```text
constant React state updates
layout-triggering animations
huge blur filters
massive SVGs
Three.js unnecessarily
scroll event + setState
```

And don't add `will-change: transform` to everything permanently. Apply it only to elements that actually animate.

---


```

The website needs to generate:

```text
FRAME 01
    ↓
FRAME 01.2
    ↓
FRAME 01.7
    ↓
FRAME 02
    ↓
FRAME 02.4
    ↓
FRAME 03
...
```

That is why **scroll-linked animation** is the correct implementation.

---

# 31. The final architecture I'd personally use

```text
                    PAGE
                     │
                     ▼
             ┌───────────────┐
             │ Story Section │
             │    500vh      │
             └───────┬───────┘
                     │
                     ▼
             ┌───────────────┐
             │  Sticky Scene │
             │    100vh      │
             └───────┬───────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      Card 1       Card 2       Card 3
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
                 Connector
                     │
                     ▼
                   Text

                     ▲
                     │
              GSAP Timeline
                     ▲
                     │
                ScrollTrigger
                     ▲
                     │
                  Scroll
```

That's the system I would build.

---

# 32. One important improvement I'd make to your concept

Your screenshots currently show:

> Will it → Labelbox → Uber

I would make the **text itself become the narrative**, rather than having labels simply appear.



Then the layers progressively become:

```text
                    DATA
                     ↓
                  ABTalks
                     ↓
                    COMPANY
```

Now the animation has a **reason to exist**.

That's the difference between:

> "Cool 3D animation"

and

> "A storytelling website."

The Vision Fund site does this kind of thing well: the visual motion supports its narrative around founders, technology, and the AI ecosystem rather than functioning as an isolated animation. ([SoftBank Vision Fund][1])

---

## What I would use for your exact project

**Stack:**

```text
Next.js + TypeScript
        +
      GSAP
        +
 ScrollTrigger
        +
     CSS 3D
        +
      SVG
```

**Not:**

```text
Three.js ❌
Video ❌
Lottie ❌
GIF ❌
4 separate screenshots ❌
```

You can get this effect **much more cleanly and responsively with DOM + CSS 3D + GSAP**.



### The order I'd actually code it

```text
01. Build one card
        ↓
02. Give it 3D perspective
        ↓
03. Build 3-card stack
        ↓
04. Match screenshot #1
        ↓
05. Add GSAP
        ↓
06. Make screenshot #2
        ↓
07. Make screenshot #3
        ↓
08. Make screenshot #4
        ↓
09. Connect the states into one timeline
        ↓
10. Add text + connector
        ↓
11. Add easing + micro-motion
        ↓
12. Responsive layout
        ↓
13. Reduced motion
        ↓
14. Performance testing
        ↓
15. Final visual tuning
```

**The most important thing:** don't start by trying to write the entire GSAP timeline. First make the **static scene pixel-close to your screenshots**. Once the geometry is correct, the animation becomes relatively straightforward.

Inspiration from:  https://visionfund.com/ "Shared Vision, Amplified Ambition | SoftBank Vision Fund"
