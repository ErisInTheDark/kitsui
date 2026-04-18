import { Component } from "../../../src";
import { runPageCleanup } from "./lifecycle";

////////////////////////////////////
//#region Doc Registry

const documentRegistry = (window as any).documentRegistry = new Map<string, string>()

interface PersistentRuntimeNodes {
	bodyNodes: HTMLElement[]
	headNodes: HTMLElement[]
}

let currentUpdateId = 0
async function updatePageRegistry () {
	if (currentUpdateId)
		return
	
	const id = currentUpdateId = Math.random()
	
	const pending = new Set<string>()
	for (const link of document.getElementsByTagName("a")) { 
		const href = link.getAttribute("href")
		const url = (href && new URL(href, location.href)) || undefined
		if (url?.origin !== location.origin)
			continue

		pending.add(url.pathname)
	}

	for (const path of documentRegistry.keys())
		pending.delete(path)

	const pendingArr = Array.from(pending)
	for (let i = 0; i < pendingArr.length; i += 3) {
		const batch = pendingArr.slice(i, i + 3)
		await Promise.all(batch.map(async (path) => {
			const text = await fetch(path).then(res => res.text()).catch(() => null)

			if (text && currentUpdateId === id)
				// only save if this update is still the current
				documentRegistry.set(path, text)
		}))
		
		if (currentUpdateId !== id)
			return // if another update started, stop
	}
}

async function getPageHTML (path: string): Promise<string | undefined> {
	const saved = documentRegistry.get(path)
	if (saved)
		return saved
	
	await updatePageRegistry()
	return documentRegistry.get(path)
}

setTimeout(() => {
	updatePageRegistry()
}, 100)

//#endregion
////////////////////////////////////

////////////////////////////////////
//#region Navigation

window.navigation?.addEventListener("navigate", onNavigate)

function cleanup () { 
	runPageCleanup();
	(window as any).documentRegistry = undefined
	window.navigation?.removeEventListener("navigate", onNavigate)
}

export function capturePersistentRuntimeNodes (documentRef: Document = document): PersistentRuntimeNodes {
	return {
		bodyNodes: Array.from(documentRef.body.querySelectorAll(".monaco-aria-container")) as HTMLElement[],
		headNodes: Array.from(documentRef.head.querySelectorAll("style.monaco-colors, link[data-monaco-editor-styles='true'], link[href*='/vs/editor/editor.main.css']")) as HTMLElement[],
	}
}

export function restorePersistentRuntimeNodes (
	nodes: PersistentRuntimeNodes,
	documentRef: Document = document,
): void {
	for (const node of nodes.headNodes) {
		documentRef.head.appendChild(node)
	}

	for (const node of nodes.bodyNodes) {
		documentRef.body.appendChild(node)
	}
}

export function replaceScripts () { 
	cleanup()

	const scripts = Array.from(document.getElementsByTagName("script"))
	for (const script of scripts) {
		let src = script.getAttribute("src")
		if (!src)
			continue

		script.remove()

		src = `${src.replace(/\?.*$/, "")}?cacheBust=${Date.now()}`
		Component("script")
			.use((newScript: Component) => {
				for (const attr of script.attributes)
					newScript.attribute.set(attr.name, attr.value)
			})
			.attribute.set("src", src)
			.appendTo(document.body)
	}
}

export function scrollPostNavigate (url: URL, documentRef: Document = document, windowRef: Window = window): "top" | "hash" | "none" {
	if (!url.hash) {
		windowRef.scrollTo({
			behavior: "smooth",
			left: 0,
			top: 0,
		})
		return "top"
	}

	try {
		const target = documentRef.getElementById(decodeURIComponent(url.hash.slice(1)))
		if (!target)
			return "none"

		target.scrollIntoView({
			behavior: "smooth",
			block: "start",
		})
		return "hash"
	} catch {
		return "none"
	}
}

async function doNavigate (path: string, url: URL) {
	const pageHTML = await getPageHTML(path)
	if (!pageHTML) {
		navigation.navigate("404.html", { history: "replace" })
		return
	}

	function showNewHTML () { 
		const persistentRuntimeNodes = capturePersistentRuntimeNodes()
		document.documentElement.innerHTML = pageHTML!
		restorePersistentRuntimeNodes(persistentRuntimeNodes)
		replaceScripts()
		setTimeout(() => {
			scrollPostNavigate(url)
		}, 0)
	}

	if (!("startViewTransition" in document)) { 
		showNewHTML()
		return
	}

	document.startViewTransition(async () => {
		showNewHTML()
		await new Promise(r => setTimeout(r, 50))
	});
}

function onNavigate (event: NavigateEvent) {
	const dest = new URL(event.destination.url)
	if (dest.origin !== location.origin || !event.canIntercept)
		return
	
	if (event.navigationType === "reload")
		return event.intercept({
			async handler () {
				cleanup()
				await doNavigate(location.pathname, new URL(location.href))
			}
		})

	if (dest.pathname === location.pathname && dest.hash !== location.hash)
		return event.intercept({
			scroll: "manual",
			async handler () {
				setTimeout(() => {
					scrollPostNavigate(dest)
				}, 50)
			}
		})
	
	event.intercept({
		async handler () { 
			await doNavigate(dest.pathname, dest)
		},
	})
}

//#endregion
////////////////////////////////////
