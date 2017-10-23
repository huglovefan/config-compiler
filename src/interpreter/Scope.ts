/**
 * case-insensitive string-to-T map with an optional parent map to also search in
 */
export default class Scope <TItem>
{
	private object: {[key: string]: TItem};
	
	constructor (parent?: Scope<TItem>)
	{
		const proto = (parent !== undefined) ? parent.object : null;
		this.object = Object.create(proto);
	}
	
	get (name: string)
	{
		return this.object[name.toLowerCase()];
	}
	
	set (name: string, value: TItem)
	{
		this.object[name.toLowerCase()] = value;
	}
	
	has (name: string)
	{
		return name.toLowerCase() in this.object;
	}
	
	hasOwn (name: string)
	{
		return <boolean> Object.prototype.hasOwnProperty.call(this.object, name.toLowerCase());
	}
}