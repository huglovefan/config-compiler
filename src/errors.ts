import {Token} from "./parsing/Tokenizer.js";
import {Node} from "./parsing/Node.js";

export interface SourcePositions
{
	start: number;
	end: number;
}

/**
 * something wrong with compiler state that shouldn't ever happen
 */
export class CompilerError extends Error
{
}

/**
 * something wrong with cfg code
 */
export class CFGError extends Error
{
	static for (thing: SourcePositions, message: string)
	{
		return new this(message, thing.start, thing.end);
	}
	
	static unexpectedNode (node: Node<any, any>)
	{
		const constructor = Object.getPrototypeOf(node).constructor;
		return this.for(node, `Unexpected node ${constructor.name}`);
	}
	
	static unexpectedToken (token: Token)
	{
		return this.for(token, `Unexpected token ${token.type}`);
	}
	
	readonly start: number;
	readonly end: number;
	
	constructor (message: string, start: number, end: number)
	{
		super(message);
		
		this.start = start;
		this.end = end;
	}
	
	toString (_source: string)
	{
		// todo: print a fancier message with the source positions highlighted
		
		return super.toString();
	}
}