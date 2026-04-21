/*
TODO
- Replace manual inline style attribute writes with component.style.set() in PondBubble, FishButton, FishMagnetActor, GullFleet.spawnGull, and the pond radioactiveWasteDump binding.
- Record the escape hatch selectors used here so Style.ts can support them directly: "{& #preview-root-shell}", "{& #preview-root}", and "{&[disabled]}".
- Split the large style-definition block into clearer sections so the example reads top-down: app layout, pond/depth layers, fish/gulls/magnet, upgrades, and buttons.
- Simplify FishSchool, especially the nested FishButton closure, by extracting smaller helpers for setup, movement, mutation, and the repeated offscreen/catch transition.
- Deduplicate the repeated random position, rotation, and scale jitter logic used by the fish and magnet positioning helpers.
- Deduplicate the repeated timer scheduling and cleanup patterns used by BubbleSpawner, DockWorker, FishButton, FishMagnetActor, and GullFleet.
- Replace the unclear FishSchool.render() downscale branch with more explicit remove-all, shrink, and grow paths without changing behavior.
- Extract the many tuning numbers for timings, offsets, rotation ranges, and scale adjustments into named constants with brief intent-revealing names.
- Add short comments where this file is demonstrating non-obvious patterns: the depth-layer illusion, lifecycle-owned timers, and why fishHandles is mutated in place.
- Remove or put to use currently unused styles/constants such as panelTextStyle, pondFooterStyle, and tinyNoteStyle.
*/

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
    whenFocusSelf,
    whenHover,
} from "kitsui";

interface UpgradeDefinition {
	buttonLabel: State<string>;
	canAfford: State<boolean>;
	cost: State<number>;
	description: string;
	effect: string;
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

StyleRoot({
	display: "grid",
	height: "100%",
	userSelect: "none",
	// escape hatch because this example doesn't control these
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

const panelTextStyle = Style.Class("fish-sim-panel-text", {
	color: "$textBody",
	fontSize: "13px",
	lineHeight: 1.5,
	margin: 0,
})

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

const pondFooterStyle = Style.Class("fish-sim-pond-footer", {
	alignItems: "end",
	bottom: "14px",
	display: "flex",
	justifyContent: "space-between",
	left: "16px",
	position: "absolute",
	right: "16px",
	zIndex: 1,
})

const tinyNoteStyle = Style.Class("fish-sim-tiny-note", {
	color: "color-mix(in srgb, white 76%, $textSubtle)",
	fontSize: "12px",
	fontWeight: 700,
	margin: 0,
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
	"{&[disabled]}": {
		cursor: "not-allowed",
		opacity: 0.4,
	},
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
		.attribute.set("style", `--bubble-left:${left}%; --bubble-bottom:${bottom}%; --bubble-size:${size}px; --bubble-duration:${duration}ms; --bubble-depth:${depth}px; --bubble-blur:${blur}px;`)
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
	const side = Math.floor(Math.random() * 4)
	const horizontal = Math.round(10 + Math.random() * 80)
	const vertical = Math.round(16 + Math.random() * 64)
	const depth = Math.round(-50 + Math.random() * 110)

	if (side === 0) {
		return {
			depth,
			left: -28,
			rotate: Math.round(-22 + Math.random() * 44),
			scale: Number((baseScale * (0.96 + Math.random() * 0.12)).toFixed(2)),
			top: vertical,
		}
	}

	if (side === 1) {
		return {
			depth,
			left: 128,
			rotate: Math.round(-22 + Math.random() * 44),
			scale: Number((baseScale * (0.96 + Math.random() * 0.12)).toFixed(2)),
			top: vertical,
		}
	}

	if (side === 2) {
		return {
			depth,
			left: horizontal,
			rotate: Math.round(-22 + Math.random() * 44),
			scale: Number((baseScale * (0.96 + Math.random() * 0.12)).toFixed(2)),
			top: -28,
		}
	}

	return {
		depth,
		left: horizontal,
		rotate: Math.round(-22 + Math.random() * 44),
		scale: Number((baseScale * (0.96 + Math.random() * 0.12)).toFixed(2)),
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

		timeoutId = window.setTimeout(() => {
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
		if (timeoutId !== null) {
			clearTimeout(timeoutId)
			timeoutId = null
		}
	})

	return field
}

function randomFishPosition (baseScale = 1, anchor?: { left: number; top: number }): FishPosition {
	const left = anchor ? anchor.left + Math.round(-5 + Math.random() * 10) : Math.round(10 + Math.random() * 80)
	const top = anchor ? anchor.top + Math.round(-6 + Math.random() * 12) : Math.round(10 + Math.random() * 80)

	return {
		depth: Math.round(-260 + Math.random() * 340),
		left,
		rotate: Math.round(-22 + Math.random() * 44),
		scale: Number((baseScale * (0.96 + Math.random() * 0.12)).toFixed(2)),
		top: top,
	}
}

function randomMagnetPosition (): { depth: number; left: number; top: number } {
	return {
		depth: Math.round(-60 + Math.random() * 140),
		left: Math.round(18 + Math.random() * 64),
		top: Math.round(16 + Math.random() * 68),
	}
}

function randomFishPositionAroundMagnet (baseScale: number, magnet: { left: number; top: number }): FishPosition {
	const left = Math.max(8, Math.min(92, magnet.left + Math.round(-14 + Math.random() * 28)))
	const top = Math.max(8, Math.min(92, magnet.top + Math.round(-14 + Math.random() * 28)))

	return {
		depth: Math.round(-40 + Math.random() * 120),
		left,
		rotate: Math.round(-22 + Math.random() * 44),
		scale: Number((baseScale * (0.96 + Math.random() * 0.12)).toFixed(2)),
		top,
	}
}

function formatFish (value: number): string {
	return Math.floor(value).toLocaleString("en-US")
}

function createUpgradeDefinition (
	root: Component,
	purchaseCount: State<number>,
	blueprint: UpgradeBlueprint,
	resources: {
		fishCount: State<number>;
		unlockProgress: State<number>;
	},
): UpgradeDefinition {
	const cost = purchaseCount.map(currentCount => Math.round(blueprint.baseCost * blueprint.growth ** currentCount))
	const budget = State.Group(root, {
		cost,
		fishCount: resources.fishCount,
	})
	const canAfford = budget.map(({ cost, fishCount }) => fishCount >= cost)
	const unlocked = blueprint.unlockAt <= 0
		? State.Readonly(true)
		: resources.unlockProgress.map(progress => progress >= blueprint.unlockAt)
	const buttonLabel = State.Group(root, {
		cost,
		fishCount: resources.fishCount,
		unlocked,
	}).map(({ cost, fishCount, unlocked }) => {
		if (!unlocked) {
			return "Unavailable"
		}

		return fishCount >= cost ? `${blueprint.action} (${formatFish(cost)})` : `Need ${formatFish(cost)}`
	})

	return {
		buttonLabel,
		canAfford,
		cost,
		description: blueprint.description,
		effect: blueprint.effect,
		name: blueprint.name,
		onBuy () {
			blueprint.onBuy(cost.value)
		},
		unlocked,
	}
}

function DockWorker (autoFish: State<number>, fishCount: State<number>, captainLog: State<string>): Component {
	const worker = Component("div")
		.attribute.add("hidden")
		.aria.hidden(true)

	let mounted = false
	let intervalId: number | null = null

	const stopTimer = (): void => {
		if (intervalId !== null) {
			clearInterval(intervalId)
			intervalId = null
		}
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

		intervalId = window.setInterval(() => {
			if (autoFish.value <= 0) {
				stopTimer()
				return
			}

			fishCount.update(total => total + autoFish.value)
			captainLog.set(`Your side crew quietly hauled in ${formatFish(autoFish.value)} fish while you maintained strong clipboard energy.`)
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
		.text.set(definition.unlocked.map(root, unlocked => unlocked ? definition.name : "???"))

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
		multiplier: 1 | 2 | 3 | 4;
	}

	let fish: FishInstance[] = []
	let currentFishAdded = pondFishAdded.value

	function getTargetTemplatesByMultiplier (fishAdded: number): Record<1 | 2 | 3 | 4, FishTemplate[]> {
		const templates = buildFishTemplates(fishAdded)

		return {
			1: templates.filter(template => template.multiplier === 1),
			2: templates.filter(template => template.multiplier === 2),
			3: templates.filter(template => template.multiplier === 3),
			4: templates.filter(template => template.multiplier === 4),
		}
	}

	function countFishByMultiplier (multiplier: 1 | 2 | 3 | 4, excluding?: FishInstance): number {
		return fish.filter(instance => instance !== excluding && instance.multiplier === multiplier).length
	}

	function removeFishInstance (instance: FishInstance): void {
		fish = fish.filter(existing => existing !== instance)
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

	function FishButton (template: FishTemplate, anchor: { left: number; top: number }, spawnFromOffscreen = false): FishInstance {
		const button = Component("button")
			.attribute.set("type", "button")
			.class.add(fishButtonStyle)

		const templateState = new State<FishTemplate>(button, template)
		const catchable = new State(button, !spawnFromOffscreen)
		const facing = new State(button, 1)
		const filter = new State(button, "none")
		const mutated = new State(button, false)
		const mutationScale = new State(button, 1)
		const offscreen = new State(button, spawnFromOffscreen)
		const visible = new State(button, !spawnFromOffscreen)
		const position = new State<FishPosition>(button, spawnFromOffscreen ? randomOffPondPosition(template.scale) : randomFishPosition(template.scale, anchor))
		const transition = new State(button, spawnFromOffscreen ? "none" : fishTransitionValue)

		button
			.text.set(templateState.map(nextTemplate => nextTemplate.emoji))
			.aria.label(State.Group(button, {
				mutated,
				power: catchPower,
				template: templateState,
			}).map(({ mutated, power, template }) => {
				const valueMultiplier = template.multiplier * (mutated ? 3 : 1)
				return `Catch ${mutated ? `radioactive ${template.name}` : template.name}. Worth ${valueMultiplier}x for +${formatFish(power * valueMultiplier)} fish.`
			}))
			.attribute.set("style", State.Group(button, {
				filter,
				visible,
				facing,
				mutationScale,
				position,
				transition,
			}).map(({ filter, visible, facing, mutationScale, position, transition }) => `--fish-depth:${position.depth}px; --fish-facing:${facing}; --fish-filter:${filter}; --fish-left:${position.left}%; --fish-mutation-scale:${mutationScale}; --fish-opacity:${visible ? 1 : 0}; --fish-top:${position.top}%; --fish-tilt:${position.rotate}deg; --fish-scale:${position.scale}; --fish-transition:${transition};`))
			.event.owned.on.mousedown(() => {
				const nextTemplate = templateState.value
				onCatch(nextTemplate, "click", nextTemplate.multiplier * (mutated.value ? 3 : 1), mutated.value)
				catchable.set(false)
				visible.set(false)
				transition.set("none")
				moveTo(randomOffPondPosition(nextTemplate.scale))
				offscreen.set(true)
				schedule()
			})

		let timeoutId: number | null = null
		let catchableTimeoutId: number | null = null
		let active = false
		let fishInstance!: FishInstance
		let mutationExposure = 0

		const getNextMoveDelay = (): number => Math.round(820 + Math.random() * 680)

		const setMutation = (nextMutated: boolean): void => {
			mutated.set(nextMutated)
			mutationScale.set(nextMutated ? 1.34 : 1)
			filter.set(nextMutated ? radioactiveFishFilter : "none")
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

		const moveTo = (nextPosition: FishPosition): void => {
			const currentPosition = position.value
			if (nextPosition.left !== currentPosition.left) {
				facing.set(nextPosition.left > currentPosition.left ? 1 : -1)
			}

			position.set(nextPosition)
		}

		const spawnIn = (): void => {
			catchable.set(false)
			transition.set(fishTransitionValue)
			setMutation(false)
			mutationExposure = 0
			visible.set(true)
			window.setTimeout(() => {
				if (!button.disposed) {
					moveTo(magnetTarget.value
						? randomFishPositionAroundMagnet(templateState.value.scale, magnetTarget.value)
						: randomFishPosition(templateState.value.scale))
					offscreen.set(false)
				}
			}, 24)
			if (catchableTimeoutId !== null) {
				clearTimeout(catchableTimeoutId)
			}
			catchableTimeoutId = window.setTimeout(() => {
				if (!button.disposed) {
					catchable.set(true)
				}
			}, 460)
		}

		const schedule = (delay = getNextMoveDelay()): void => {
			if (!active) {
				return
			}

			if (timeoutId !== null) {
				clearTimeout(timeoutId)
				timeoutId = null
			}

			timeoutId = window.setTimeout(() => {
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
				}, 24)
			}
			schedule()
		})

		button.event.owned.on.Dispose(() => {
			active = false
			if (timeoutId !== null) {
				clearTimeout(timeoutId)
				timeoutId = null
			}
			if (catchableTimeoutId !== null) {
				clearTimeout(catchableTimeoutId)
				catchableTimeoutId = null
			}
		})

		button.appendTo(layer)

		const handle: PondFishHandle = {
			catchByGull () {
				if (offscreen.value || !catchable.value) {
					return
				}

				const nextTemplate = templateState.value
				onCatch(nextTemplate, "gull", nextTemplate.multiplier * (mutated.value ? 3 : 1), mutated.value)
				catchable.set(false)
				visible.set(false)
				transition.set("none")
				moveTo(randomOffPondPosition(nextTemplate.scale))
				offscreen.set(true)
				schedule()
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
				button.remove()
			},
			handle,
			multiplier: template.multiplier as 1 | 2 | 3 | 4,
		}

		return fishInstance
		}

	const render = (nextFishAdded: number): void => {
		const targets = getTargetTemplatesByMultiplier(nextFishAdded)

		if (nextFishAdded < currentFishAdded) {
			if (nextFishAdded === 0) {
				for (const fishInstance of fish) {
					fishInstance.dispose()
				}
				fish = []
				fishHandles.length = 0
			} else {
			currentFishAdded = nextFishAdded
			return
			}
		}

		const slots = shuffle(pondSlots)
		let slotIndex = 0
		for (const multiplier of [1, 2, 3, 4] as const) {
			const targetTemplates = targets[multiplier]
			const currentCount = countFishByMultiplier(multiplier)
			for (let index = currentCount; index < targetTemplates.length; index++) {
				const fishInstance = FishButton(targetTemplates[index], slots[slotIndex % pondSlots.length], true)
				fish.push(fishInstance)
				fishHandles.push(fishInstance.handle)
				slotIndex += 1
			}
		}

		currentFishAdded = nextFishAdded
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

	magnet.attribute.set("style", State.Group(magnet, {
		depth,
		left,
		opacity,
		scale,
		top,
		transition,
	}).map(({ depth, left, opacity, scale, top, transition }) => `--magnet-depth:${depth}; --magnet-left:${left}; --magnet-opacity:${opacity}; --magnet-scale:${scale}; --magnet-top:${top}; --magnet-transition:${transition};`))

	let appearTimeoutId: number | null = null
	let hideTimeoutId: number | null = null
	let active = true
	let previousPurchases = magnetPurchases.value

	const clearTimers = (): void => {
		if (appearTimeoutId !== null) {
			clearTimeout(appearTimeoutId)
			appearTimeoutId = null
		}

		if (hideTimeoutId !== null) {
			clearTimeout(hideTimeoutId)
			hideTimeoutId = null
		}
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
		appearTimeoutId = window.setTimeout(() => {
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

			hideTimeoutId = window.setTimeout(() => {
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
		magnetTarget.set(null)
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

		gull.attribute.set("style", State.Group(gull, {
			depth,
			duration,
			facing,
			left,
			opacity,
			top,
		}).map(({ depth, duration, facing, left, opacity, top }) => `--gull-depth:${depth}px; --gull-duration:${duration}; --gull-facing:${facing}; --gull-left:${left}%; --gull-opacity:${opacity}; --gull-top:${top}%;`))

		let timeoutId: number | null = null
		let checkIntervalId: number | null = null
		let active = false

		const schedule = (): void => {
			if (!active) {
				return
			}

			timeoutId = window.setTimeout(() => {
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

				if (checkIntervalId !== null) {
					clearInterval(checkIntervalId)
				}

				window.setTimeout(() => {
					if (!gull.disposed) {
						left.set(endLeft)
					}
				}, 24)

				checkIntervalId = window.setInterval(() => {
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
						if (checkIntervalId !== null) {
							clearInterval(checkIntervalId)
							checkIntervalId = null
						}

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
			if (timeoutId !== null) {
				clearTimeout(timeoutId)
				timeoutId = null
			}
			if (checkIntervalId !== null) {
				clearInterval(checkIntervalId)
				checkIntervalId = null
			}
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

export default function FishingSimExample (): Component {
	const root = Component("div")
		.class.add(shellStyle)

	const fishCount = new State(root, 0)
	const catchPower = new State(root, 1)
	const autoFish = new State(root, 0)
	const fishMagnetPurchases = new State(root, 0)
	const internGulls = new State(root, 0)
	const magnetTarget = new State<{ left: number; top: number } | null>(root, null)
	const radioactiveWasteDump = new State(root, 0)
	const totalCatches = new State(root, 0)
	const pondFishAdded = new State(root, 0)
	const captainLog = new State(root, "The pond is calm. That usually means the fish are plotting.")
	const fishTier = pondFishAdded.map(root, fishAdded => getFishTier(fishAdded))
	const fishHandles: PondFishHandle[] = []

	const fishEmoji = fishTier.map(root, tier => fishTierSpecies[tier])

	const situationReport = State.Group(root, {
		autoFish,
		catchPower,
		fishCount,
		fishEmoji,
		fishTier,
	}).map(({ autoFish, catchPower, fishCount, fishEmoji, fishTier }) => `${fishEmoji} ${formatFish(fishCount)} fish · ${formatFish(catchPower)}/base click · ${formatFish(autoFish)}/sec`)

	function catchFish (fish: FishTemplate, source: "click" | "gull", valueMultiplier: number, mutated: boolean): void {
		const haul = catchPower.value * valueMultiplier
		const fishLabel = mutated ? `radioactive ${fish.name}` : fish.name
		fishCount.update(total => total + haul)
		if (source === "click") {
			totalCatches.update(total => total + 1)
			captainLog.set(`You hooked a ${fishLabel} for +${formatFish(haul)} fish. The rest of the school took that personally.`)
			return
		}

		captainLog.set(`An intern gull stole a ${fishLabel} for +${formatFish(haul)} fish and refused to file paperwork.`)
	}

	const upgradePurchases = [
		new State(root, 0),
		new State(root, 0),
		new State(root, 0),
		new State(root, 0),
	]

	function resetGame (): void {
		fishCount.set(0)
		catchPower.set(1)
		autoFish.set(0)
		fishMagnetPurchases.set(0)
		internGulls.set(0)
		magnetTarget.set(null)
		radioactiveWasteDump.set(0)
		pondFishAdded.set(0)
		totalCatches.set(0)
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
				.text.set(situationReport),
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
		.attribute.set("style", radioactiveWasteDump.map(level => `--pond-waste-opacity:${Math.min(level * 0.055, 0.32).toFixed(2)};`))
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
				fishCount.update(total => total - cost)
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
				fishCount.update(total => total - cost)
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
				fishCount.update(total => total - cost)
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
				fishCount.update(total => total - cost)
				radioactiveWasteDump.update(total => total + 1)
				upgradePurchases[3].update(count => count + 1)
				captainLog.set("You approved a radioactive waste dump. The fish are handling it in a way that should concern everyone.")
			},
			unlockAt: 10,
		},
	]

	const upgradeDefinitions = upgradePurchases.map((purchaseCount, index) => createUpgradeDefinition(root, purchaseCount, upgradeBlueprints[index], {
		fishCount,
		unlockProgress: pondFishAdded,
	}))

	for (const definition of upgradeDefinitions) {
		UpgradeCard(root, definition)
			.appendTo(upgradesWrap)
	}

	root.append(DockWorker(autoFish, fishCount, captainLog))

	return root
}