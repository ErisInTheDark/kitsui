import {
    Component,
    elements,
    pseudoAfter,
    pseudoBefore,
    State,
    Style,
    StyleAnimation,
    StyleRoot,
    whenActive,
    whenDisabled,
    whenFocusSelf,
    whenHover,
} from "kitsui";

interface UpgradeDefinition {
	buttonLabel: State<string>;
	canAfford: State<boolean>;
	cost: State<number>;
	description: string;
	effect: string;
	levelLabel: State<string>;
	name: string;
	onBuy (): void;
	unlocked: State<boolean>;
}

interface UpgradeBlueprint {
	action: string;
	baseCost: number;
	description: string;
	effect: string;
	growth: number;
	name: string;
	onBuy (cost: number): void;
	unlockAt: number;
}

interface FishPosition {
	depth: number;
	left: number;
	rotate: number;
	scale: number;
	top: number;
}

interface FishTemplate {
	name: string;
	emoji: string;
	multiplier: number;
	scale: number;
}

interface PondFishHandle {
	catchByGull (): void;
	intersectsGull (gullRect: DOMRect, pondRect: DOMRect): boolean;
}

type FishMultiplier = 1 | 2 | 3 | 4;

StyleRoot({
	display: "grid",
	height: "100%",
	userSelect: "none",
	// Intentional escape hatches: the docs preview shell owns these ids.
	"{& #preview-root-shell}": {
		height: "100%",
	},
	"{& #preview-root}": {
		height: "100%",
	},
}).appendTo(document.head)

const shimmerAnimation = StyleAnimation("fish-sim-shimmer", {
	"0%": {
		borderColor: "$accentPrimary",
		filter: "saturate(1)",
	},
	"50%": {
		borderColor: "$accentReturns",
		filter: "saturate(1.12)",
	},
	"100%": {
		borderColor: "$accentPrimary",
		filter: "saturate(1)",
	},
})

const bubbleAnimation = StyleAnimation("fish-sim-bubbles", {
	"0%": {
		opacity: 0,
		transform: "translate3d(0, 0, ${bubbleDepth: 0px}) scale(0.84)",
	},
	"12%": {
		opacity: 0.3,
		transform: "translate3d(0, -5px, ${bubbleDepth: 0px}) scale(0.92)",
	},
	"100%": {
		opacity: 0,
		transform: "translate3d(0, -36px, ${bubbleDepth: 0px}) scale(1.04)",
	},
})

// App layout styles.

const shellStyle = Style.Class("fish-sim-shell", {
	height: "100%",
	display: "flex",
	flexDirection: "column",
	gap: "16px",
	padding: "16px",
})

const headerStyle = Style.Class("fish-sim-header", {
	display: "grid",
	gap: "6px",
})

const titleStyle = Style.Class("fish-sim-title", {
	color: "$textBright",
	fontSize: "clamp(24px, 4vw, 32px)",
	fontWeight: 800,
	lineHeight: 1.1,
	margin: 0,
	display: "flex",
	alignItems: "center",
	gap: "12px",
})

const summaryStyle = Style.Class("fish-sim-summary", {
	color: "$textMuted",
	fontSize: "14px",
	lineHeight: 1.5,
	margin: 0,
})

const summaryPrimaryStatStyle = Style.Class("fish-sim-summary-primary-stat", {
	color: "$textBright",
	fontWeight: 800,
})

const columnsStyle = Style.Class("fish-sim-columns", {
	flexGrow: 1,
	display: "grid",
	gap: "16px",
	gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
})

const panelStyle = Style.Class("fish-sim-panel", {
	display: "grid",
	gridTemplateRows: "auto 1fr",
	gap: "12px",
	position: "relative",
})

const panelContentStyle = Style.Class("fish-sim-panel-content", {
	position: "relative",
})

const panelTitleStyle = Style.Class("fish-sim-panel-title", {
	color: "$textBright",
	fontSize: "16px",
	fontWeight: 800,
	margin: 0,
	height: "fit-content",
})

// Pond and depth styles.

const pondStyle = Style.Class("fish-sim-pond", {
	background: "radial-gradient(circle at top, rgba(218, 236, 255, 0.22), rgba(163, 225, 124, ${pondWasteOpacity: 0}) 24%, rgba(255, 255, 255, 0) 38%), linear-gradient(180deg, rgba(126, 176, 84, calc(${pondWasteOpacity: 0} * 0.9)) 0%, rgba(87, 134, 55, calc(${pondWasteOpacity: 0} * 0.7)) 52%, rgba(58, 92, 39, calc(${pondWasteOpacity: 0} * 0.85)) 100%), linear-gradient(180deg, color-mix(in srgb, #6ea8cb 22%, $bgRaised) 0%, color-mix(in srgb, #4d87ad 14%, $bgRaised) 48%, color-mix(in srgb, #2f6185 22%, $bgRaised) 100%)",
	borderRadius: "12px",
	boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
	minHeight: "280px",
	flexGrow: 1,
	overflow: "hidden",
	padding: "16px",
	perspective: "300px",
	position: "relative",
	transformStyle: "preserve-3d",
	pointerEvents: "none",
	...pseudoBefore({
		background: "radial-gradient(circle, rgba(198, 225, 255, 0.36) 0%, rgba(198, 225, 255, 0) 72%)",
		content: '""',
		height: "150px",
		left: "-28px",
		opacity: 0.8,
		position: "absolute",
		top: "-54px",
		width: "150px",
		zIndex: -1,
	}),
	...pseudoAfter({
		background: "linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(5, 21, 31, 0.14) 100%)",
		bottom: 0,
		content: '""',
		left: 0,
		position: "absolute",
		right: 0,
		top: "62%",
		zIndex: -1,
	}),
})

const pondDecorStyle = Style.Class("fish-sim-pond-decor", {
	inset: 0,
	position: "absolute",
	transformStyle: "preserve-3d",
	zIndex: 1,
})

const pondBackDecorStyle = Style.Class("fish-sim-pond-back-decor", {
	inset: 0,
	position: "absolute",
	transform: "translateZ(-60px)",
	transformStyle: "preserve-3d",
})

const pondFrontDecorStyle = Style.Class("fish-sim-pond-front-decor", {
	inset: 0,
	position: "absolute",
	transform: "translateZ(60px)",
	transformStyle: "preserve-3d",
})

const pondDepthLayerStyle = Style.Class("fish-sim-pond-depth-layer", {
	inset: 0,
	position: "absolute",
})

// Layered translateZ offsets and opacity shifts fake pond depth without a full 3D scene.
const pondDepthBackStyle = Style.Class("fish-sim-pond-depth-back", {
	background: "radial-gradient(circle at 22% 18%, rgba(184, 230, 255, 0.18) 0%, rgba(235, 248, 255, 0.1) 26%, rgba(235, 248, 255, 0) 62%), radial-gradient(circle at 78% 72%, rgba(134, 194, 232, 0.1) 0%, rgba(134, 194, 232, 0) 48%), linear-gradient(180deg, rgba(125, 183, 223, 0.08) 0%, rgba(44, 102, 146, 0.02) 100%)",
	opacity: 0.85,
	transform: "translateZ(-160px) scale(2.4)",
})

const pondDepthMidStyle = Style.Class("fish-sim-pond-depth-mid", {
	background: "radial-gradient(circle at 68% 38%, rgba(210, 234, 252, 0.08) 0%, rgba(210, 234, 252, 0) 40%), linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 26%, rgba(9, 34, 52, 0.05) 100%)",
	opacity: 0.8,
	transform: "translateZ(18px)",
})

const pondDepthFrontStyle = Style.Class("fish-sim-pond-depth-front", {
	background: "radial-gradient(circle at 82% 20%, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 20%, rgba(255, 255, 255, 0) 40%), linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(192, 224, 247, 0.06) 46%, rgba(9, 34, 52, 0.12) 100%)",
	opacity: 0.9,
	transform: "translateZ(120px)",
})

const pondBubbleStyle = Style.Class("fish-sim-pond-bubble", {
	animationDuration: "${bubbleDuration: 3100ms}",
	animationIterationCount: "infinite",
	animationName: bubbleAnimation,
	animationTimingFunction: "linear",
	background: "rgba(255, 255, 255, 0.12)",
	border: "1px solid rgba(255, 255, 255, 0.3)",
	borderRadius: "999px",
	bottom: "${bubbleBottom: 10%}",
	filter: "blur(${bubbleBlur: 0px})",
	left: "${bubbleLeft: 20%}",
	position: "absolute",
	transform: "translate3d(0, 0, ${bubbleDepth: 0px})",
	height: "${bubbleSize: 16px}",
	width: "${bubbleSize: 16px}",
})

// Fish, gull, and magnet styles.

const fishSchoolStyle = Style.Class("fish-sim-fish-school", {
	inset: 0,
	position: "absolute",
	transform: "translateZ(0)",
	transformStyle: "preserve-3d",
})

const gullFleetStyle = Style.Class("fish-sim-gull-fleet", {
	inset: 0,
	position: "absolute",
	transformStyle: "preserve-3d",
})

const gullStyle = Style.Class("fish-sim-gull", {
	fontSize: "40px",
	left: "${gullLeft: -12%}",
	opacity: "${gullOpacity: 0}",
	position: "absolute",
	scale: "calc(${gullFacing: 1} * -1) 1",
	top: "${gullTop: 26%}",
	transform: "translate3d(-50%, -50%, ${gullDepth: 0px})",
	transition: "left ${gullDuration: 1200ms} linear, top ${gullDuration: 1200ms} linear, opacity 120ms ease, transform ${gullDuration: 1200ms} linear",
	willChange: "left, top, opacity, transform, scale",
})

const fishMagnetStyle = Style.Class("fish-sim-fish-magnet", {
	fontSize: "34px",
	left: "${magnetLeft: 50%}",
	opacity: "${magnetOpacity: 0}",
	position: "absolute",
	scale: "${magnetScale: 0.7} ${magnetScale: 0.7}",
	top: "${magnetTop: 50%}",
	transform: "rotate(-90deg) translate3d(-50%, -50%, ${magnetDepth: 0px})",
	transformOrigin: "-20% 30%",
	transition: "${magnetTransition: left 0ms linear, top 260ms ease, opacity 120ms ease, transform 260ms ease, scale 160ms ease}",
})

const fishButtonStyle = Style.Class("fish-sim-fish-button", {
	alignItems: "center",
	appearance: "none",
	background: "transparent",
	border: "0",
	borderRadius: "999px",
	boxShadow: "none",
	cursor: "pointer",
	display: "grid",
	filter: "${fishFilter: none}",
	fontSize: "72px",
	height: "96px",
	justifyContent: "center",
	pointerEvents: "auto",
	left: "${fishLeft: 50%}",
	lineHeight: 1,
	opacity: "${fishOpacity: 1}",
	padding: 0,
	position: "absolute",
	textShadow: "0 6px 14px rgba(8, 24, 44, 0.12)",
	top: "${fishTop: 50%}",
	scale: "calc(${fishScale: 1} * ${fishMutationScale: 1} * ${fishFacing: 1} * -1) calc(${fishScale: 1} * ${fishMutationScale: 1})",
	transform: "translate3d(-50%, -50%, ${fishDepth: 0px}) rotate(${fishTilt: 0deg})",
	transformOrigin: "-20% 30%",
	transition: "${fishTransition: left 820ms ease 90ms, top 820ms ease 90ms, transform 820ms ease 90ms, filter 160ms ease}",
	transitionProperty: "left, top, transform, filter, scale",
	transitionDuration: "820ms, 820ms, 820ms, 160ms, 110ms",
	transitionTimingFunction: "ease, ease, ease, ease, ease-out",
	transitionDelay: "90ms, 90ms, 90ms, 0ms, 0ms",
	width: "96px",
	...whenHover({
		background: "none",
	}),
	...whenFocusSelf({
		outline: "none",
	}),
})

// Upgrade and control styles.

const upgradesStyle = Style.Class("fish-sim-upgrades", {
	position: "absolute",
	inset: 0,
	display: "grid",
	gap: "10px",
	overflowY: "scroll",
	alignContent: "flex-start",
})

const upgradeCardStyle = Style.Class("fish-sim-upgrade-card", {
	background: "$bgSurface",
	border: "1px solid $borderSubtle",
	borderRadius: "10px",
	display: "grid",
	gap: "6px",
	padding: "10px 12px",
	transition: "border-color 120ms ease",
	...elements("p", {
		margin: 0,
	}),
})

const upgradeAffordableStyle = Style.Class("fish-sim-upgrade-affordable", {
	animationDuration: "2s",
	animationIterationCount: "infinite",
	animationName: shimmerAnimation,
	animationTimingFunction: "ease-in-out",
})

const upgradeLockedStyle = Style.Class("fish-sim-upgrade-locked", {
	opacity: 0.5,
})

const upgradeNameStyle = Style.Class("fish-sim-upgrade-name", {
	color: "$textBright",
	fontSize: "14px",
	fontWeight: 800,
	margin: 0,
})

const upgradeMetaStyle = Style.Class("fish-sim-upgrade-meta", {
	color: "$textMuted",
	fontSize: "12px",
	lineHeight: 1.4,
	margin: 0,
})

const buyButtonStyle = Style.Class("fish-sim-buy-button", {
	appearance: "none",
	background: "$accentPrimary",
	border: "0",
	borderRadius: "6px",
	color: "$bgPage",
	cursor: "pointer",
	fontSize: "12px",
	fontWeight: 800,
	justifySelf: "start",
	padding: "6px 10px",
	transition: "transform 120ms ease, filter 120ms ease, opacity 120ms ease",
	...whenHover({
		filter: "brightness(1.1)",
	}),
	...whenActive({
		transform: "translateY(1px)",
	}),
	...whenFocusSelf({
		outline: "2px solid $borderMuted",
		outlineOffset: "2px",
	}),
	...whenDisabled({
		cursor: "not-allowed",
		opacity: 0.4,
	}),
})

const liveStatusStyle = Style.Class("fish-sim-live-status", {
	alignItems: "center",
	background: "$bgRaised",
	borderRadius: "8px",
	color: "$textBody",
	display: "flex",
	fontSize: "12px",
	fontWeight: 600,
	height: "44px",
	overflow: "hidden",
	padding: "8px 10px",
})

const resetButtonStyle = Style.Class("fish-sim-reset-button", {
	appearance: "none",
	background: "transparent",
	border: "1px solid $borderMuted",
	borderRadius: "6px",
	color: "$textMuted",
	cursor: "pointer",
	fontSize: "12px",
	fontWeight: 700,
	justifySelf: "start",
	padding: "6px 10px",
	...whenHover({
		background: "$bgRaised",
	}),
	...whenFocusSelf({
		outline: "2px solid $borderMuted",
		outlineOffset: "2px",
	}),
})

function PondBubble (left: number, bottom: number, size: number, duration: number, depth: number, blur: number): Component {
	return Component("span")
		.class.add(pondBubbleStyle)
		.style.set({
			$bubbleLeft: `${left}%`,
			$bubbleBottom: `${bottom}%`,
			$bubbleSize: `${size}px`,
			$bubbleDuration: `${duration}ms`,
			$bubbleDepth: `${depth}px`,
			$bubbleBlur: `${blur}px`,
		})
		.aria.hidden(true)
}

const pondSlots = [
	{ left: 14, top: 14 },
	{ left: 28, top: 24 },
	{ left: 44, top: 16 },
	{ left: 62, top: 22 },
	{ left: 80, top: 14 },
	{ left: 20, top: 40 },
	{ left: 36, top: 48 },
	{ left: 52, top: 38 },
	{ left: 68, top: 46 },
	{ left: 84, top: 40 },
	{ left: 16, top: 66 },
	{ left: 34, top: 76 },
	{ left: 52, top: 70 },
	{ left: 70, top: 80 },
	{ left: 86, top: 68 },
] as const

const fishTierSpecies = ["🐟", "🐠", "🐡", "🐋"] as const
const fishTypeNames = ["Minnow", "Reef Snapper", "Puffer Menace", "Dock Whale"] as const
const fishTransitionValue = "left 420ms ease, top 420ms ease, transform 240ms ease, filter 240ms ease"
const magnetTransitionValue = "left 0ms linear, top 260ms ease, opacity 120ms ease, transform 260ms ease, scale 160ms ease"
const radioactiveFishFilter = "grayscale(1) sepia(1) saturate(6) hue-rotate(58deg)"
const fishRotationOffset = -22
const fishRotationRange = 44
const fishScaleJitterBase = 0.96
const fishScaleJitterRange = 0.12
const offPondSideCount = 4
const offPondHorizontalOffset = 10
const offPondHorizontalRange = 80
const offPondVerticalOffset = 16
const offPondVerticalRange = 64
const offPondDepthOffset = -50
const offPondDepthRange = 110
const fishAnchorLeftOffset = -5
const fishAnchorLeftRange = 10
const fishAnchorTopOffset = -6
const fishAnchorTopRange = 12
const fishRoamLeftOffset = 10
const fishRoamLeftRange = 80
const fishRoamTopOffset = 10
const fishRoamTopRange = 80
const fishDepthOffset = -260
const fishDepthRange = 340
const magnetDepthOffset = -60
const magnetDepthRange = 140
const magnetLeftOffset = 18
const magnetLeftRange = 64
const magnetTopOffset = 16
const magnetTopRange = 68
const fishNearMagnetOffset = -14
const fishNearMagnetRange = 28
const fishNearMagnetMin = 8
const fishNearMagnetMax = 92
const fishNearMagnetDepthOffset = -40
const fishNearMagnetDepthRange = 120
const fishMoveDelayBaseMs = 820
const fishMoveDelayRangeMs = 680
const fishRespawnDelayMs = 24
const fishCatchableDelayMs = 460
const fishMultipliers = [1, 2, 3, 4] as const

function clearScheduledTimeout (timeoutId: number | null): null {
	if (timeoutId !== null) {
		clearTimeout(timeoutId)
	}

	return null
}

function clearScheduledInterval (intervalId: number | null): null {
	if (intervalId !== null) {
		clearInterval(intervalId)
	}

	return null
}

function scheduleTimeout (timeoutId: number | null, callback: () => void, delay: number): number {
	if (timeoutId !== null) {
		clearTimeout(timeoutId)
	}

	return window.setTimeout(callback, delay)
}

function scheduleInterval (intervalId: number | null, callback: () => void, delay: number): number {
	if (intervalId !== null) {
		clearInterval(intervalId)
	}

	return window.setInterval(callback, delay)
}

function randomRounded (offset: number, range: number): number {
	return Math.round(offset + Math.random() * range)
}

function randomFishRotation (): number {
	return randomRounded(fishRotationOffset, fishRotationRange)
}

function randomFishScale (baseScale: number): number {
	return Number((baseScale * (fishScaleJitterBase + Math.random() * fishScaleJitterRange)).toFixed(2))
}

function shuffle<T> (items: readonly T[]): T[] {
	const shuffled = [...items]

	for (let index = shuffled.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(Math.random() * (index + 1))
		const current = shuffled[index]
		shuffled[index] = shuffled[swapIndex]
		shuffled[swapIndex] = current
	}

	return shuffled
}

function getSchoolComposition (pondFishAdded: number): {
	minnows: number;
	puffers: number;
	reefSnappers: number;
	tier: 0 | 1 | 2 | 3;
	whales: number;
} {
	let minnows = pondFishAdded + 1
	let reefSnappers = 0
	let puffers = 0
	let whales = 0

	while (minnows > 5) {
		minnows -= 4
		reefSnappers += 1
	}

	while (reefSnappers > 4) {
		reefSnappers -= 3
		puffers += 1
	}

	while (puffers > 4) {
		puffers -= 3
		whales += 1
	}

	return {
		minnows,
		puffers,
		reefSnappers,
		tier: whales > 0 ? 3 : puffers > 0 ? 2 : reefSnappers > 0 ? 1 : 0,
		whales,
	}
}

function getFishTier (fishAdded: number): 0 | 1 | 2 | 3 {
	return getSchoolComposition(fishAdded).tier
}

function buildFishTemplates (fishAdded: number): FishTemplate[] {
	const composition = getSchoolComposition(fishAdded)
	const minnowScale = composition.tier >= 3 ? 0.42 : composition.tier === 2 ? 0.52 : composition.tier === 1 ? 0.68 : 0.9
	const reefScale = composition.tier >= 3 ? 0.68 : composition.tier === 2 ? 0.84 : 1.02
	const pufferScale = composition.tier >= 3 ? 0.86 : 1.06
	const templates: FishTemplate[] = []

	for (let index = 0; index < composition.minnows; index++) {
		templates.push({
			name: fishTypeNames[0],
			emoji: fishTierSpecies[0],
			multiplier: 1,
			scale: Number((minnowScale - index * 0.03).toFixed(2)),
		})
	}

	for (let index = 0; index < composition.reefSnappers; index++) {
		templates.push({
			name: fishTypeNames[1],
			emoji: fishTierSpecies[1],
			multiplier: 2,
			scale: Number((reefScale - index * 0.05).toFixed(2)),
		})
	}

	for (let index = 0; index < composition.puffers; index++) {
		templates.push({
			name: fishTypeNames[2],
			emoji: fishTierSpecies[2],
			multiplier: 3,
			scale: Number((pufferScale - index * 0.06).toFixed(2)),
		})
	}

	for (let index = 0; index < composition.whales; index++) {
		templates.push({
			name: fishTypeNames[3],
			emoji: fishTierSpecies[3],
			multiplier: 4,
			scale: Number((1.08 - index * 0.06).toFixed(2)),
		})
	}

	return templates
}

function randomOffPondPosition (baseScale = 1): FishPosition {
	const side = Math.floor(Math.random() * offPondSideCount)
	const horizontal = randomRounded(offPondHorizontalOffset, offPondHorizontalRange)
	const vertical = randomRounded(offPondVerticalOffset, offPondVerticalRange)
	const depth = randomRounded(offPondDepthOffset, offPondDepthRange)

	if (side === 0) {
		return {
			depth,
			left: -28,
			rotate: randomFishRotation(),
			scale: randomFishScale(baseScale),
			top: vertical,
		}
	}

	if (side === 1) {
		return {
			depth,
			left: 128,
			rotate: randomFishRotation(),
			scale: randomFishScale(baseScale),
			top: vertical,
		}
	}

	if (side === 2) {
		return {
			depth,
			left: horizontal,
			rotate: randomFishRotation(),
			scale: randomFishScale(baseScale),
			top: -28,
		}
	}

	return {
		depth,
		left: horizontal,
		rotate: randomFishRotation(),
		scale: randomFishScale(baseScale),
		top: 128,
	}
}

function BubbleSpawner (): Component {
	const field = Component("div")
		.class.add(pondDecorStyle)
		.aria.hidden(true)

	const backField = Component("div")
		.class.add(pondBackDecorStyle)
		.appendTo(field)

	const frontField = Component("div")
		.class.add(pondFrontDecorStyle)
		.appendTo(field)

	Component("div")
		.class.add(pondDepthLayerStyle)
		.class.add(pondDepthBackStyle)
		.appendTo(field)

	Component("div")
		.class.add(pondDepthLayerStyle)
		.class.add(pondDepthMidStyle)
		.appendTo(field)

	Component("div")
		.class.add(pondDepthLayerStyle)
		.class.add(pondDepthFrontStyle)
		.appendTo(field)

	// Recurring actor timers in this example are owned by component lifecycle and cleared on Dispose.
	let timeoutId: number | null = null
	let active = false

	const spawnBubble = (): void => {
		const depth = Math.round(-120 + Math.random() * 280)
		const closeBubble = depth > 40
		const targetField = depth > 40 ? frontField : backField
		const size = closeBubble
			? Math.round(16 + Math.random() * 16)
			: Math.round(8 + Math.random() * 14)
		const blur = closeBubble ? Number((1 + Math.random() * 2.4).toFixed(1)) : Number((Math.random() * 0.6).toFixed(1))
		const bubble = PondBubble(
			Math.round(8 + Math.random() * 84),
			Math.round(8 + Math.random() * 70),
			size,
			Math.round(2200 + Math.random() * 1600),
			depth,
			blur,
		).appendTo(targetField)

		window.setTimeout(() => {
			if (!bubble.disposed) {
				bubble.remove()
			}
		}, 4200)
	}

	const schedule = (): void => {
		if (!active) {
			return
		}

		timeoutId = scheduleTimeout(timeoutId, () => {
			spawnBubble()
			if (Math.random() > 0.7) {
				spawnBubble()
			}
			schedule()
		}, Math.round(320 + Math.random() * 520))
	}

	field.event.owned.on.Mount(() => {
		active = true
		for (let index = 0; index < 4; index++) {
			spawnBubble()
		}
		schedule()
	})

	field.event.owned.on.Dispose(() => {
		active = false
		timeoutId = clearScheduledTimeout(timeoutId)
	})

	return field
}

function randomFishPosition (baseScale = 1, anchor?: { left: number; top: number }): FishPosition {
	const left = anchor
		? anchor.left + randomRounded(fishAnchorLeftOffset, fishAnchorLeftRange)
		: randomRounded(fishRoamLeftOffset, fishRoamLeftRange)
	const top = anchor
		? anchor.top + randomRounded(fishAnchorTopOffset, fishAnchorTopRange)
		: randomRounded(fishRoamTopOffset, fishRoamTopRange)

	return {
		depth: randomRounded(fishDepthOffset, fishDepthRange),
		left,
		rotate: randomFishRotation(),
		scale: randomFishScale(baseScale),
		top,
	}
}

function randomMagnetPosition (): { depth: number; left: number; top: number } {
	return {
		depth: randomRounded(magnetDepthOffset, magnetDepthRange),
		left: randomRounded(magnetLeftOffset, magnetLeftRange),
		top: randomRounded(magnetTopOffset, magnetTopRange),
	}
}

function randomFishPositionAroundMagnet (baseScale: number, magnet: { left: number; top: number }): FishPosition {
	const left = Math.max(fishNearMagnetMin, Math.min(fishNearMagnetMax, magnet.left + randomRounded(fishNearMagnetOffset, fishNearMagnetRange)))
	const top = Math.max(fishNearMagnetMin, Math.min(fishNearMagnetMax, magnet.top + randomRounded(fishNearMagnetOffset, fishNearMagnetRange)))

	return {
		depth: randomRounded(fishNearMagnetDepthOffset, fishNearMagnetDepthRange),
		left,
		rotate: randomFishRotation(),
		scale: randomFishScale(baseScale),
		top,
	}
}

function formatFish (value: number): string {
	return Math.floor(value).toLocaleString("en-US")
}

function formatMoney (value: number): string {
	return `$${formatFish(value)}`
}

function formatMoneyRate (value: number): string {
	return `$${value.toFixed(2)}`
}

function toRomanNumeral (value: number): string {
	const numerals = [
		{ value: 1000, symbol: "M" },
		{ value: 900, symbol: "CM" },
		{ value: 500, symbol: "D" },
		{ value: 400, symbol: "CD" },
		{ value: 100, symbol: "C" },
		{ value: 90, symbol: "XC" },
		{ value: 50, symbol: "L" },
		{ value: 40, symbol: "XL" },
		{ value: 10, symbol: "X" },
		{ value: 9, symbol: "IX" },
		{ value: 5, symbol: "V" },
		{ value: 4, symbol: "IV" },
		{ value: 1, symbol: "I" },
	] as const

	let remaining = Math.max(1, Math.floor(value))
	let result = ""

	for (const numeral of numerals) {
		while (remaining >= numeral.value) {
			result += numeral.symbol
			remaining -= numeral.value
		}
	}

	return result
}

function formatCatchSummary (catchTotals: Record<FishMultiplier, number>): string {
	const parts: string[] = []

	let skippedZero = false
	for (const multiplier of fishMultipliers) {
		const count = catchTotals[multiplier]
		if (count > 0 || !skippedZero) {
			parts.push(`${formatFish(count)} ${fishTierSpecies[multiplier - 1]}`)
			skippedZero = true
		}
	}

	while (parts.length < fishMultipliers.length) {
		parts.push("0 ❓")
	}

	return parts.join(", ")
}

function createUpgradeDefinition (
	root: Component,
	purchaseCount: State<number>,
	blueprint: UpgradeBlueprint,
	resources: {
		money: State<number>;
		unlockProgress: State<number>;
	},
): UpgradeDefinition {
	const cost = purchaseCount.map(root, currentCount => Math.round(blueprint.baseCost * blueprint.growth ** currentCount))
	const budget = State.Group(root, {
		cost,
		money: resources.money,
	})
	const canAfford = budget.map(({ cost, money }) => money >= cost)
	const unlocked = blueprint.unlockAt <= 0
		? State.Readonly(true)
		: resources.unlockProgress.map(progress => progress >= blueprint.unlockAt)
	const levelLabel = purchaseCount.map(root, currentCount => toRomanNumeral(currentCount + 1))
	const buttonLabel = State.Group(root, {
		cost,
		money: resources.money,
		unlocked,
	}).map(({ cost, money, unlocked }) => {
		if (!unlocked) {
			return "Unavailable"
		}

		return money >= cost ? `${blueprint.action} (${formatMoney(cost)})` : `Need ${formatMoney(cost)}`
	})

	return {
		buttonLabel,
		canAfford,
		cost,
		description: blueprint.description,
		effect: blueprint.effect,
		levelLabel,
		name: blueprint.name,
		onBuy () {
			blueprint.onBuy(cost.value)
		},
		unlocked,
	}
}

function DockWorker (autoFish: State<number>, money: State<number>, captainLog: State<string>): Component {
	const worker = Component("div")
		.attribute.add("hidden")
		.aria.hidden(true)

	let mounted = false
	let intervalId: number | null = null

	const stopTimer = (): void => {
		intervalId = clearScheduledInterval(intervalId)
	}

	const syncTimer = (): void => {
		if (!mounted) {
			return
		}

		if (autoFish.value <= 0) {
			stopTimer()
			return
		}

		if (intervalId !== null) {
			return
		}

		intervalId = scheduleInterval(intervalId, () => {
			if (autoFish.value <= 0) {
				stopTimer()
				return
			}

			money.update(total => total + autoFish.value)
			captainLog.set(`Your side crew quietly hauled in ${formatMoney(autoFish.value)} while you maintained strong clipboard energy.`)
		}, 1000)
	}

	autoFish.subscribe(worker, () => {
		syncTimer()
	})

	worker.event.owned.on.Mount(() => {
		mounted = true
		syncTimer()
	})

	worker.event.owned.on.Dispose(() => {
		mounted = false
		stopTimer()
	})

	return worker
}

function UpgradeCard (root: Component, definition: UpgradeDefinition): Component {
	const card = Component("article")
		.class.add(upgradeCardStyle)
		.class.bind(definition.canAfford, upgradeAffordableStyle)
		.class.bind(definition.unlocked.map(root, unlocked => !unlocked), upgradeLockedStyle)

	const title = Component("h3")
		.class.add(upgradeNameStyle)
			.text.set(State.Group(root, {
				levelLabel: definition.levelLabel,
				unlocked: definition.unlocked,
			}).map(({ levelLabel, unlocked }) => unlocked ? `${definition.name} ${levelLabel}` : "???"))

	const detail = Component("p")
		.class.add(upgradeMetaStyle)
		.text.set(definition.unlocked.map(root, unlocked => unlocked ? definition.description : "????"))

	const effect = Component("p")
		.class.add(upgradeMetaStyle)
		.text.set(definition.effect)

	const buttonDisabled = State.Group(root, {
		canAfford: definition.canAfford,
		unlocked: definition.unlocked,
	}).map(({ canAfford, unlocked }) => !unlocked || !canAfford)

	const button = Component("button")
		.attribute.set("type", "button")
		.attribute.bind(buttonDisabled, "disabled")
		.class.add(buyButtonStyle)
		.text.set(definition.buttonLabel)
		.aria.labelledBy(title)
		.aria.describedBy(definition.unlocked.map(root, unlocked => unlocked ? [detail, effect] : [detail]))
		.aria.disabled(buttonDisabled)
		.event.owned.on.click(() => {
			if (!buttonDisabled.value) {
				definition.onBuy()
			}
		})

	card.append(title, detail)
	effect.appendToWhen(definition.unlocked, card)
	button.appendTo(card)
	return card
}

function FishSchool (
	root: Component,
	pond: Component,
	catchPower: State<number>,
	pondFishAdded: State<number>,
	magnetTarget: State<{ left: number; top: number } | null>,
	radioactiveWasteDump: State<number>,
	fishHandles: PondFishHandle[],
	onCatch: (fish: FishTemplate, source: "click" | "gull", valueMultiplier: number, mutated: boolean) => void,
): Component {
	const layer = Component("div")
		.class.add(fishSchoolStyle)
		.appendTo(pond)

	type FishInstance = {
		button: Component;
		dispose (): void;
		handle: PondFishHandle;
		multiplier: FishMultiplier;
	}

	type FishButtonState = {
		catchable: State<boolean>;
		facing: State<number>;
		filter: State<string>;
		mutated: State<boolean>;
		mutationScale: State<number>;
		offscreen: State<boolean>;
		position: State<FishPosition>;
		template: State<FishTemplate>;
		transition: State<string>;
		visible: State<boolean>;
	}

	let fish: FishInstance[] = []

	function getTargetTemplatesByMultiplier (fishAdded: number): Record<FishMultiplier, FishTemplate[]> {
		const templates = buildFishTemplates(fishAdded)

		return {
			1: templates.filter(template => template.multiplier === 1),
			2: templates.filter(template => template.multiplier === 2),
			3: templates.filter(template => template.multiplier === 3),
			4: templates.filter(template => template.multiplier === 4),
		}
	}

	function countFishByMultiplier (multiplier: FishMultiplier, excluding?: FishInstance): number {
		return fish.filter(instance => instance !== excluding && instance.multiplier === multiplier).length
	}

	function createFishButtonState (button: Component, template: FishTemplate, anchor: { left: number; top: number }, spawnFromOffscreen: boolean): FishButtonState {
		return {
			catchable: new State(button, !spawnFromOffscreen),
			facing: new State(button, 1),
			filter: new State(button, "none"),
			mutated: new State(button, false),
			mutationScale: new State(button, 1),
			offscreen: new State(button, spawnFromOffscreen),
			position: new State<FishPosition>(button, spawnFromOffscreen ? randomOffPondPosition(template.scale) : randomFishPosition(template.scale, anchor)),
			template: new State<FishTemplate>(button, template),
			transition: new State(button, spawnFromOffscreen ? "none" : fishTransitionValue),
			visible: new State(button, !spawnFromOffscreen),
		}
	}

	function bindFishButtonPresentation (button: Component, fishState: FishButtonState, onClickCatch: () => void): void {
		const style = State.Group(button, fishState).map(({ filter, visible, facing, mutationScale, position, transition }) => ({
			$fishDepth: `${position.depth}px`,
			$fishFacing: facing,
			$fishFilter: filter,
			$fishLeft: `${position.left}%`,
			$fishMutationScale: mutationScale,
			$fishOpacity: visible ? 1 : 0,
			$fishTop: `${position.top}%`,
			$fishTilt: `${position.rotate}deg`,
			$fishScale: position.scale,
			$fishTransition: transition,
		}))

		button
			.text.set(fishState.template.map(nextTemplate => nextTemplate.emoji))
			.aria.label(State.Group(button, {
				mutated: fishState.mutated,
				power: catchPower,
				template: fishState.template,
			}).map(({ mutated, power, template }) => {
				const valueMultiplier = template.multiplier * (mutated ? 3 : 1)
				return `Catch ${mutated ? `radioactive ${template.name}` : template.name}. Worth ${valueMultiplier}x for +${formatMoney(power * valueMultiplier)}.`
			}))
			.style.set(style)
			.event.owned.on.mousedown(onClickCatch)
	}

	function setFishMutation (fishState: FishButtonState, nextMutated: boolean): void {
		fishState.mutated.set(nextMutated)
		fishState.mutationScale.set(nextMutated ? 1.34 : 1)
		fishState.filter.set(nextMutated ? radioactiveFishFilter : "none")
	}

	function moveFish (fishState: FishButtonState, nextPosition: FishPosition): void {
		const currentPosition = fishState.position.value
		if (nextPosition.left !== currentPosition.left) {
			fishState.facing.set(nextPosition.left > currentPosition.left ? 1 : -1)
		}

		fishState.position.set(nextPosition)
	}

	function transitionFishOffscreen (fishState: FishButtonState, nextTemplate: FishTemplate, reschedule: () => void): void {
		fishState.catchable.set(false)
		fishState.visible.set(false)
		fishState.transition.set("none")
		moveFish(fishState, randomOffPondPosition(nextTemplate.scale))
		fishState.offscreen.set(true)
		reschedule()
	}

	function removeFishInstance (instance: FishInstance): void {
		fish = fish.filter(existing => existing !== instance)
		// fishHandles is shared with the gull actor, so mutate the shared array in place to keep both views synced.
		const handleIndex = fishHandles.indexOf(instance.handle)
		if (handleIndex >= 0) {
			fishHandles.splice(handleIndex, 1)
		}
		instance.dispose()
	}

	function shouldRespawnFish (instance: FishInstance): boolean {
		const targets = getTargetTemplatesByMultiplier(pondFishAdded.value)
		return countFishByMultiplier(instance.multiplier, instance) < targets[instance.multiplier].length
	}

	function clearAllFish (): void {
		for (const fishInstance of fish) {
			fishInstance.dispose()
		}

		fish = []
		fishHandles.length = 0
	}

	function shrinkFishToTargets (targets: Record<FishMultiplier, FishTemplate[]>): void {
		for (const multiplier of fishMultipliers) {
			let extraFish = countFishByMultiplier(multiplier) - targets[multiplier].length

			if (extraFish <= 0) {
				continue
			}

			for (let index = fish.length - 1; index >= 0; index--) {
				if (extraFish <= 0) {
					break
				}

				const fishInstance = fish[index]

				if (fishInstance.multiplier !== multiplier) {
					continue
				}

				removeFishInstance(fishInstance)
				extraFish -= 1
			}
		}
	}

	function growFishToTargets (targets: Record<FishMultiplier, FishTemplate[]>): void {
		const slots = shuffle(pondSlots)
		let slotIndex = 0

		for (const multiplier of fishMultipliers) {
			const targetTemplates = targets[multiplier]
			const currentCount = countFishByMultiplier(multiplier)

			for (let index = currentCount; index < targetTemplates.length; index++) {
				const fishInstance = FishButton(targetTemplates[index], slots[slotIndex % pondSlots.length], true)
				fish.push(fishInstance)
				fishHandles.push(fishInstance.handle)
				slotIndex += 1
			}
		}
	}

	function FishButton (template: FishTemplate, anchor: { left: number; top: number }, spawnFromOffscreen = false): FishInstance {
		const button = Component("button")
			.attribute.set("type", "button")
			.class.add(fishButtonStyle)

		const fishState = createFishButtonState(button, template, anchor, spawnFromOffscreen)
		const { catchable, mutated, offscreen, position, template: templateState, transition } = fishState

		bindFishButtonPresentation(button, fishState, () => {
			catchFish("click")
		})

		let timeoutId: number | null = null
		let catchableTimeoutId: number | null = null
		let active = false
		let fishInstance!: FishInstance
		let mutationExposure = 0

		const getNextMoveDelay = (): number => randomRounded(fishMoveDelayBaseMs, fishMoveDelayRangeMs)

		const clearTimers = (): void => {
			timeoutId = clearScheduledTimeout(timeoutId)
			catchableTimeoutId = clearScheduledTimeout(catchableTimeoutId)
		}

		const transitionToCaught = (nextTemplate: FishTemplate): void => {
			transitionFishOffscreen(fishState, nextTemplate, schedule)
		}

		const catchFish = (source: "click" | "gull"): void => {
			const nextTemplate = templateState.value
			onCatch(nextTemplate, source, nextTemplate.multiplier * (mutated.value ? 3 : 1), mutated.value)
			transitionToCaught(nextTemplate)
		}

		const setMutation = (nextMutated: boolean): void => {
			setFishMutation(fishState, nextMutated)
		}

		const rollMutation = (): void => {
			if (radioactiveWasteDump.value <= 0) {
				setMutation(false)
				mutationExposure = 0
				return
			}

			if (mutated.value) {
				return
			}

			mutationExposure += 1
			const mutationChance = Math.min(mutationExposure * radioactiveWasteDump.value * 0.0125, 0.32)
			if (Math.random() < mutationChance) {
				setMutation(true)
			}
		}

		const moveTo = (nextPosition: FishPosition): void => moveFish(fishState, nextPosition)

		const spawnIn = (): void => {
			catchable.set(false)
			transition.set(fishTransitionValue)
			setMutation(false)
			mutationExposure = 0
			fishState.visible.set(true)
			window.setTimeout(() => {
				if (!button.disposed) {
					moveTo(magnetTarget.value
						? randomFishPositionAroundMagnet(templateState.value.scale, magnetTarget.value)
						: randomFishPosition(templateState.value.scale))
					offscreen.set(false)
				}
			}, fishRespawnDelayMs)
			catchableTimeoutId = scheduleTimeout(catchableTimeoutId, () => {
				if (!button.disposed) {
					catchable.set(true)
				}
			}, fishCatchableDelayMs)
		}

		const schedule = (delay = getNextMoveDelay()): void => {
			if (!active) {
				return
			}

			timeoutId = scheduleTimeout(timeoutId, () => {
				if (offscreen.value) {
					if (shouldRespawnFish(fishInstance)) {
						spawnIn()
					} else {
						removeFishInstance(fishInstance)
						return
					}
				} else if (!magnetTarget.value && Math.random() > 0.15) {
					rollMutation()
					moveTo(randomFishPosition(templateState.value.scale))
				}
				schedule()
			}, delay)
		}

		radioactiveWasteDump.subscribe(button, () => {
			if (radioactiveWasteDump.value <= 0) {
				setMutation(false)
				mutationExposure = 0
			}
		})

		magnetTarget.subscribe(button, target => {
			if (target === null || offscreen.value) {
				return
			}

			transition.set(fishTransitionValue)
			moveTo(randomFishPositionAroundMagnet(templateState.value.scale, target))
		})

		button.event.owned.on.Mount(() => {
			active = true
			if (spawnFromOffscreen) {
				window.setTimeout(() => {
					if (!button.disposed) {
						spawnIn()
					}
				}, fishRespawnDelayMs)
			}
			schedule()
		})

		button.event.owned.on.Dispose(() => {
			active = false
			clearTimers()
		})

		button.appendTo(layer)

		const handle: PondFishHandle = {
			catchByGull () {
				if (offscreen.value || !catchable.value) {
					return
				}

				catchFish("gull")
			},
			intersectsGull (gullRect: DOMRect, pondRect: DOMRect) {
				if (offscreen.value || !catchable.value) {
					return false
				}

				if (
					gullRect.right <= pondRect.left
					|| gullRect.left >= pondRect.right
					|| gullRect.bottom <= pondRect.top
					|| gullRect.top >= pondRect.bottom
				) {
					return false
				}

				const fishRect = button.element.getBoundingClientRect()
				const catchLeft = gullRect.left - 24
				const catchRight = gullRect.right + 24
				const catchTop = gullRect.top - 18
				const catchBottom = gullRect.bottom + 18

				return !(
					fishRect.right < catchLeft
					|| fishRect.left > catchRight
					|| fishRect.bottom < catchTop
					|| fishRect.top > catchBottom
				)
			},
		}

		fishInstance = {
			button,
			dispose () {
				clearTimers()
				button.remove()
			},
			handle,
			multiplier: template.multiplier as FishMultiplier,
		}

		return fishInstance
	}

	const render = (nextFishAdded: number): void => {
		const targets = getTargetTemplatesByMultiplier(nextFishAdded)

		shrinkFishToTargets(targets)
		growFishToTargets(targets)
	}

	render(pondFishAdded.value)
	pondFishAdded.subscribe(layer, render)
	return layer
}

function FishMagnetActor (
	pond: Component,
	magnetPurchases: State<number>,
	magnetTarget: State<{ left: number; top: number } | null>,
	captainLog: State<string>,
): Component {
	const magnet = Component("div")
		.class.add(fishMagnetStyle)
		.text.set("🧲")
		.aria.hidden(true)
		.appendTo(pond)

	const left = new State(magnet, "50%")
	const depth = new State(magnet, "0px")
	const opacity = new State(magnet, "0")
	const scale = new State(magnet, "0.7")
	const top = new State(magnet, "50%")
	const transition = new State(magnet, magnetTransitionValue)
	const style = State.Group(magnet, {
		depth,
		left,
		opacity,
		scale,
		top,
		transition,
	}).map(({ depth, left, opacity, scale, top, transition }) => ({
		$magnetDepth: depth,
		$magnetLeft: left,
		$magnetOpacity: opacity,
		$magnetScale: scale,
		$magnetTop: top,
		$magnetTransition: transition,
	}))

	magnet.style.set(style)

	let appearTimeoutId: number | null = null
	let hideTimeoutId: number | null = null
	let active = true
	let previousPurchases = magnetPurchases.value

	const clearTimers = (): void => {
		appearTimeoutId = clearScheduledTimeout(appearTimeoutId)
		hideTimeoutId = clearScheduledTimeout(hideTimeoutId)
	}

	const schedule = (): void => {
		clearTimers()

		if (!active || magnetPurchases.value <= 0) {
			previousPurchases = magnetPurchases.value
			magnetTarget.set(null)
			opacity.set("0")
			scale.set("0.7")
			return
		}

		const immediate = previousPurchases === 0 && magnetPurchases.value > 0
		previousPurchases = magnetPurchases.value
		const delay = immediate ? 0 : Math.max(2200, 6400 - magnetPurchases.value * 360 + Math.round(Math.random() * 900))
		appearTimeoutId = scheduleTimeout(appearTimeoutId, () => {
			const position = randomMagnetPosition()
			transition.set("none")
			depth.set(`${position.depth}px`)
			left.set(`${position.left}%`)
			top.set("-18%")
			opacity.set("0")
			scale.set("0.7")
			magnetTarget.set(null)
			void magnet.element.getBoundingClientRect()
			window.requestAnimationFrame(() => {
				if (!magnet.disposed) {
					transition.set(magnetTransitionValue)
					opacity.set("1")
					scale.set("1")
					top.set(`${position.top}%`)
					magnetTarget.set({ left: position.left, top: position.top })
				}
			})
			captainLog.set("The fish magnet lit up. Every fish in the pond suddenly remembered an appointment nearby.")

			hideTimeoutId = scheduleTimeout(hideTimeoutId, () => {
				magnetTarget.set(null)
				opacity.set("0")
				scale.set("0.7")
				schedule()
			}, 2000)
		}, delay)
	}

	magnetPurchases.subscribe(magnet, schedule)

	magnet.event.owned.on.Dispose(() => {
		active = false
		clearTimers()
		magnetTarget.clear(null)
	})

	return magnet
}

function GullFleet (
	root: Component,
	pond: Component,
	internGulls: State<number>,
	fishHandles: PondFishHandle[],
): Component {
	const fleet = Component("div")
		.class.add(gullFleetStyle)
		.appendTo(pond)

	let gulls: Component[] = []
	let previousCount = internGulls.value

	const spawnGull = (index: number, immediate = false): Component => {
		const gull = Component("span")
			.class.add(gullStyle)
			.text.set("🦅")
			.aria.hidden(true)

		const left = new State(gull, -12)
		const top = new State(gull, 24 + index * 8)
		const opacity = new State(gull, "0")
		const depth = new State(gull, 0)
		const duration = new State(gull, "1200ms")
		const facing = new State(gull, 1)
		const style = State.Group(gull, {
			depth,
			duration,
			facing,
			left,
			opacity,
			top,
		}).map(({ depth, duration, facing, left, opacity, top }) => ({
			$gullDepth: `${depth}px`,
			$gullDuration: duration,
			$gullFacing: facing,
			$gullLeft: `${left}%`,
			$gullOpacity: opacity,
			$gullTop: `${top}%`,
		}))

		gull.style.set(style)

		let timeoutId: number | null = null
		let checkIntervalId: number | null = null
		let active = false

		const clearTimers = (): void => {
			timeoutId = clearScheduledTimeout(timeoutId)
			checkIntervalId = clearScheduledInterval(checkIntervalId)
		}

		const schedule = (): void => {
			if (!active) {
				return
			}

			timeoutId = scheduleTimeout(timeoutId, () => {
				const flyingRight = Math.random() > 0.5
				const flightDepth = Math.round(-60 + Math.random() * 140)
				const lane = Math.round(10 + Math.random() * 76)
				const sweepDuration = 1000 + Math.round(Math.random() * 300)
				const caught = new Set<PondFishHandle>()
				const startLeft = flyingRight ? -12 : 112
				const endLeft = flyingRight ? 112 : -12
				const flightStart = Date.now() + 24
				const pondRect = pond.element.getBoundingClientRect()

				duration.set(`${sweepDuration}ms`)
				depth.set(flightDepth)
				facing.set(flyingRight ? 1 : -1)
				top.set(lane)
				left.set(startLeft)
				opacity.set("1")

				checkIntervalId = clearScheduledInterval(checkIntervalId)

				window.setTimeout(() => {
					if (!gull.disposed) {
						left.set(endLeft)
					}
				}, 24)

				checkIntervalId = scheduleInterval(checkIntervalId, () => {
					const elapsed = Math.max(0, Date.now() - flightStart)
					const progress = Math.min(1, elapsed / sweepDuration)
					const gullRect = gull.element.getBoundingClientRect()

					for (const handle of fishHandles) {
						if (caught.has(handle)) {
							continue
						}

						if (handle.intersectsGull(gullRect, pondRect)) {
							handle.catchByGull()
							caught.add(handle)
						}
					}

					if (progress >= 1) {
						checkIntervalId = clearScheduledInterval(checkIntervalId)

						if (!gull.disposed) {
							opacity.set("0")
							left.set(endLeft)
						}
						schedule()
					}
				}, 50)
			}, immediate ? 0 : 1200 + Math.round(Math.random() * 700) + index * 180)
		}

		gull.event.owned.on.Mount(() => {
			active = true
			schedule()
		})

		gull.event.owned.on.Dispose(() => {
			active = false
			clearTimers()
		})

		gull.appendTo(fleet)

		return gull
	}

	const render = (count: number): void => {
		const immediateFirstSpawn = previousCount === 0 && count > 0
		previousCount = count

		for (const gull of gulls) {
			gull.remove()
		}

		gulls = []
		for (let index = 0; index < count; index++) {
			gulls.push(spawnGull(index, immediateFirstSpawn && index === 0))
		}
	}

	render(internGulls.value)
	internGulls.subscribe(fleet, render)
	return fleet
}

function RollingIncomeTracker (money: State<number>, rollingIncome: State<number>, resetVersion: State<number>): Component {
	const tracker = Component("div")
		.attribute.add("hidden")
		.aria.hidden(true)

	const windowMs = 10_000
	const updateIntervalMs = 250
	const samples: { amount: number; time: number }[] = []
	let lastMoney = money.value
	let intervalId: number | null = null

	const pruneSamples = (): void => {
		const cutoff = Date.now() - windowMs
		while (samples.length > 0 && samples[0].time < cutoff) {
			samples.shift()
		}
	}

	const syncRollingIncome = (): void => {
		pruneSamples()
		const income = samples.reduce((total, sample) => total + sample.amount, 0)
		rollingIncome.set(income / (windowMs / 1000))
		if (samples.length === 0 && intervalId !== null) {
			intervalId = clearScheduledInterval(intervalId)
		}
	}

	const ensureTimer = (): void => {
		if (intervalId !== null) {
			return
		}

		intervalId = scheduleInterval(intervalId, syncRollingIncome, updateIntervalMs)
	}

	money.subscribe(tracker, nextMoney => {
		const delta = nextMoney - lastMoney
		lastMoney = nextMoney

		if (delta > 0) {
			samples.push({ amount: delta, time: Date.now() })
			ensureTimer()
		}

		syncRollingIncome()
	})

	resetVersion.subscribe(tracker, () => {
		samples.length = 0
		lastMoney = money.value
		rollingIncome.set(0)
	})

	tracker.event.owned.on.Dispose(() => {
		intervalId = clearScheduledInterval(intervalId)
	})

	return tracker
}

export default function FishingSimExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	const money = new State(root, 0)
	const catchPower = new State(root, 1)
	const autoFish = new State(root, 0)
	const fishMagnetPurchases = new State(root, 0)
	const internGulls = new State(root, 0)
	const magnetTarget = new State<{ left: number; top: number } | null>(root, null)
	const radioactiveWasteDump = new State(root, 0)
	const resetVersion = new State(root, 0)
	const rollingIncome = new State(root, 0)
	const catchTotals = new State<Record<FishMultiplier, number>>(root, {
		1: 0,
		2: 0,
		3: 0,
		4: 0,
	})
	const pondFishAdded = new State(root, 0)
	const captainLog = new State(root, "The pond is calm. That usually means the fish are plotting.")
	const fishHandles: PondFishHandle[] = []

	const catchSummary = catchTotals.map(totals => `All catches: ${formatCatchSummary(totals)}`)

	function catchFish (fish: FishTemplate, source: "click" | "gull", valueMultiplier: number, mutated: boolean): void {
		const haul = catchPower.value * valueMultiplier
		const fishLabel = mutated ? `radioactive ${fish.name}` : fish.name
		money.update(total => total + haul)
		catchTotals.update(totals => ({
			...totals,
			[fish.multiplier]: totals[fish.multiplier as FishMultiplier] + 1,
		}))
		if (source === "click") {
			captainLog.set(`You hooked a ${fishLabel} for +${formatMoney(haul)}. The rest of the school took that personally.`)
			return
		}

		captainLog.set(`An intern gull stole a ${fishLabel} for +${formatMoney(haul)} and refused to file paperwork.`)
	}

	const upgradePurchases = [
		new State(root, 0),
		new State(root, 0),
		new State(root, 0),
		new State(root, 0),
	]

	function resetGame (): void {
		money.set(0)
		catchPower.set(1)
		autoFish.set(0)
		fishMagnetPurchases.set(0)
		internGulls.set(0)
		magnetTarget.set(null)
		radioactiveWasteDump.set(0)
		pondFishAdded.set(0)
		rollingIncome.set(0)
		catchTotals.set({
			1: 0,
			2: 0,
			3: 0,
			4: 0,
		})
		resetVersion.update(version => version + 1)
		captainLog.set("Everything is reset. The fish insist the previous round should not be admissible.")
		for (const purchaseCount of upgradePurchases) {
			purchaseCount.set(0)
		}
	}

	const header = Component("section")
		.class.add(headerStyle)
		.append(
			Component("h1")
				.class.add(titleStyle)
				.text.set("Highly Accurate Fishing Simulator")
				.append(Component("button")
					.attribute.set("type", "button")
					.class.add(resetButtonStyle)
					.text.set("Reset")
					.aria.label("Reset the fishing simulator")
					.event.owned.on.click(resetGame)
				),
			Component("p")
				.class.add(summaryStyle)
				.text.set("Reactive state, ARIA, placement, lifecycle, and one increasingly suspicious fish."),
			Component("p")
				.class.add(summaryStyle)
				.append(
					Component("strong")
						.class.add(summaryPrimaryStatStyle)
						.text.set(money.map(value => formatMoney(value))),
					Component("span")
						.text.set(rollingIncome.map(value => ` (${formatMoneyRate(value)}/s)`)),
					Component("span")
						.text.set(catchSummary.map(summary => ` · ${summary}`)),
				),
		)
		.appendTo(root)

	const mainColumns = Component("div")
		.class.add(columnsStyle)
		.appendTo(root)

	const pondPanel = Component("section")
		.class.add(panelStyle)
		.appendTo(mainColumns)

	const pondTitle = Component("h2")
		.class.add(panelTitleStyle)
		.text.set("Pond")

	pondPanel.append(pondTitle)

	const pond = Component("section")
		.class.add(pondStyle)
		.style.set(radioactiveWasteDump.map(level => ({
			$pondWasteOpacity: Math.min(level * 0.055, 0.32).toFixed(2),
		})))
		.appendTo(pondPanel)

	BubbleSpawner()
		.appendTo(pond)

	FishSchool(root, pond, catchPower, pondFishAdded, magnetTarget, radioactiveWasteDump, fishHandles, catchFish)
	FishMagnetActor(pond, fishMagnetPurchases, magnetTarget, captainLog)
	GullFleet(root, pond, internGulls, fishHandles)

	Component("p")
		.class.add(liveStatusStyle)
		.text.set(captainLog)
		.aria.role("status")
		.aria.live("polite")
		.appendTo(pondPanel)

	const upgradesPanel = Component("section")
		.class.add(panelStyle)
		.appendTo(mainColumns)

	Component("h2")
		.class.add(panelTitleStyle)
		.text.set("Upgrades")
		.appendTo(upgradesPanel)

	const panelContent = Component("div")
		.class.add(panelContentStyle)
		.appendTo(upgradesPanel)

	const upgradesWrap = Component("div")
		.class.add(upgradesStyle)
		.appendTo(panelContent)

	const upgradeBlueprints: UpgradeBlueprint[] = [
		{
			action: "Restock",
			baseCost: 3,
			description: "Release one more deeply cooperative fish into the pond.",
			effect: "Adds 1 fish to the pond and pushes the school toward the next species tier.",
			growth: 1.2,
			name: "Restock pond",
			onBuy (cost) {
				money.update(total => total - cost)
				pondFishAdded.update(total => total + 1)
				upgradePurchases[0].update(count => count + 1)
				captainLog.set("You added another fish to the pond. The population immediately got ideas.")
			},
			unlockAt: 0,
		},
		{
			action: "Hire",
			baseCost: 5,
			description: "Add an intern that sweeps the pond and nabs fish.",
			effect: "Adds 1 sticky-fingered intern that makes a pond pass every few seconds.",
			growth: 2,
			name: "Sticky-fingered intern",
			onBuy (cost) {
				money.update(total => total - cost)
				internGulls.update(total => total + 1)
				upgradePurchases[1].update(count => count + 1)
				captainLog.set("You hired a sticky-fingered intern. It did not bring doughnuts to the office.")
			},
			unlockAt: 4,
		},
		{
			action: "Launch",
			baseCost: 30,
			description: "A suspiciously humming fish magnet drags whole schools toward the dock. Ethics pending.",
			effect: "Adds 1 fish magnet upgrade. The magnet appears more often and pulls fish into a cluster for 2 seconds.",
			growth: 1.5,
			name: "Fish magnet",
			onBuy (cost) {
				money.update(total => total - cost)
				fishMagnetPurchases.update(total => total + 1)
				upgradePurchases[2].update(count => count + 1)
				captainLog.set("The fish magnet is online. No one has checked whether that should be legal.")
			},
			unlockAt: 7,
		},
		{
			action: "Dump",
			baseCost: 100,
			description: "Industrial runoff gives individual fish some deeply concerning growth spurts.",
			effect: "Makes individual fish randomly mutate larger more often. Mutated fish are worth 3x their normal value.",
			growth: 1.2,
			name: "Radioactive waste dump",
			onBuy (cost) {
				money.update(total => total - cost)
				radioactiveWasteDump.update(total => total + 1)
				upgradePurchases[3].update(count => count + 1)
				captainLog.set("You approved a radioactive waste dump. The fish are handling it in a way that should concern everyone.")
			},
			unlockAt: 10,
		},
	]

	const upgradeDefinitions = upgradePurchases.map((purchaseCount, index) => createUpgradeDefinition(root, purchaseCount, upgradeBlueprints[index], {
		money,
		unlockProgress: pondFishAdded,
	}))

	for (const definition of upgradeDefinitions) {
		UpgradeCard(root, definition)
			.appendTo(upgradesWrap)
	}

	root.append(DockWorker(autoFish, money, captainLog))
	root.append(RollingIncomeTracker(money, rollingIncome, resetVersion))

	return root
}
