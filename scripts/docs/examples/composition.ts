import { Component, Style, whenHover } from "kitsui";

const shellStyle = Style.Class("composition-example", {
	display: "grid",
	gap: "16px",
	padding: "16px",
})

const gridStyle = Style.Class("composition-example-grid", {
	display: "grid",
	gap: "16px",
	gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
})

const cardStyle = Style.Class("composition-card", {
	border: "1px solid #8883",
	background: "#8882",
	borderRadius: "8px",
	boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
	display: "grid",
	gap: "10px",
	padding: "16px",
	paddingBottom: 0,
})

const cardHighlightStyle = Style.Class("composition-card-highlight", {
	borderColor: "#0f766e",
	boxShadow: "0 0 0 3px rgba(20, 184, 166, 0.22)",
})

const articleStyle = Style.Class("composition-article", {
	lineHeight: 1.5,
})

const actionsStyle = Style.Class("composition-actions", {
	display: "flex",
	flexWrap: "wrap",
	gap: "10px",
})

const buttonStyle = Style.Class("composition-button", {
	alignItems: "center",
	background: "#1d4ed8",
	border: "1px solid #1d4ed8",
	borderRadius: "6px",
	color: "white",
	cursor: "pointer",
	display: "inline-flex",
	font: "inherit",
	fontWeight: 600,
	gap: "8px",
	padding: "8px 12px",
	textDecoration: "none",
	...whenHover({
		background: "#446cee",
		borderColor: "#446cee",
	}),
})

interface CardExtensions {
	highlight (): void
}

interface CardComponent extends Component, CardExtensions { }

function Card (this: Component | void): CardComponent {
	const card = Component(this ?? "section", Card)
		.class.add(cardStyle)

	return card.extend<CardExtensions>(root => ({
		highlight () {
			root.class.add(cardHighlightStyle)

			setTimeout(() => {
				if (!root.disposed) {
					root.class.remove(cardHighlightStyle)
				}
			}, 400)
		},
	}))
}

interface ArticleExtensions {
	setSummary (summary: string): void
}

interface ArticleComponent extends Component, ArticleExtensions { }

function Article (this: Component | void, title: string, summary: string): ArticleComponent {
	const article = Component(this ?? "article", Article)
		.class.add(articleStyle)

	Component("h2")
		.text.set(title)
		.appendTo(article)

	const summaryLine = Component("p")
		.text.set(summary)
		.appendTo(article)

	return article.extend<ArticleExtensions>(root => ({
		setSummary (nextSummary) {
			summaryLine.text.set(nextSummary)
		},
	}))
}

interface LinkExtensions {
	setHref (href: string): void
}

interface LinkComponent extends Component, LinkExtensions { }

function Link (this: Component | void, href: string, label: string): LinkComponent {
	const link = Component(this ?? "a", Link)
		.attribute.set("href", href)
		.text.set(label)

	return link.extend<LinkExtensions>(root => ({
		setHref (nextHref) {
			root.attribute.set("href", nextHref)
		},
	}))
}

interface ButtonExtensions {
	setPressed (pressed: boolean): void
}

interface ButtonComponent extends Component, ButtonExtensions { }

function Button (this: Component | void, label?: string): ButtonComponent {
	const button = Component(this ?? "button", Button)
		.class.add(buttonStyle)

	if (button.element.tagName === "BUTTON") {
		button.attribute.set("type", "button")
	}

	if (label) {
		button.text.set(label)
	}

	return button.extend<ButtonExtensions>(root => ({
		setPressed (pressed) {
			if (pressed) {
				root.attribute.set("aria-pressed", "true")
				return
			}

			root.attribute.remove("aria-pressed")
		},
	}))
}

export default function CompositionExample (): Component {
	const root = Component("div")
		.attribute.set("id", "composition-example")
		.class.add(shellStyle)

	const grid = Component("div")
		.class.add(gridStyle)
		.appendTo(root)

	const featured = Article(
		"Composition in kitsui",
		"Article owns the semantic content. Card adds the reusable presentation and highlight behavior.",
	)
		.and(Card)
		.appendTo(grid)

	const manual = Component("article")
		.and(Card)
		.and(Article, "Composed in place", "This article started as a plain Component and gained both builders through and().")
		.appendTo(grid)

	const actions = Component("div")
		.class.add(actionsStyle)
		.appendTo(root)

	Link("#composition-example", "Read more")
		.and(Button)
		.appendTo(actions)

	Button("Highlight cards")
		.event.owned.on.click(() => {
			featured.highlight()
			manual.highlight()
		})
		.appendTo(actions)

	return root
}
