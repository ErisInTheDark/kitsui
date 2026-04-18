namespace Arrays { 
	export function spliceOut<T> (array: T[], item: T): boolean {
		const index = array.indexOf(item);
		if (index === -1)
			return false;
		
		array.splice(index, 1);
		return true;
	}
	
	export function spliceBy<T> (array: T[], by: Iterable<T>): T[] {
		const removed: T[] = [];
		for (const item of by) {
			const index = array.indexOf(item);
			if (index !== -1) {
				array.splice(index, 1);
				removed.push(item);
			}
		}
		return removed;
	}
}

export default Arrays
