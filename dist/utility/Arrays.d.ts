declare namespace Arrays {
    function spliceOut<T>(array: T[], item: T): boolean;
    function spliceBy<T>(array: T[], by: Iterable<T>): T[];
}
export default Arrays;
