import {CompilerError, CFGError} from "./../errors.js";

const POS_UNKNOWN = -1;

enum NodeType
{
	ARGUMENT,
	COMMAND,
	COMMAND_LIST,
}

export abstract class Node <TType extends NodeType, TValue>
{
	protected abstract readonly type: TType;
	protected readonly value: TValue;
	
	start: number;
	end: number;
	
	protected constructor (value: TValue, start = POS_UNKNOWN, end = POS_UNKNOWN)
	{
		this.value = value;
		this.start = start;
		this.end = end;
	}
	
	isArgument (): this is Argument
	{
		return this.type === NodeType.ARGUMENT;
	}
	isCommand (): this is Command
	{
		return this.type === NodeType.COMMAND;
	}
	isCommandList (): this is CommandList
	{
		return this.type === NodeType.COMMAND_LIST;
	}
	
	getArgument (): Argument
	{
		if (!this.isArgument())
			throw CFGError.unexpectedNode(this);
		
		return this;
	}
	getCommand (): Command
	{
		if (!this.isCommand())
			throw CFGError.unexpectedNode(this);
		
		return this;
	}
	getCommandList (): CommandList
	{
		if (!this.isCommandList())
			throw CFGError.unexpectedNode(this);
		
		return this;
	}
}

export class Argument extends Node<NodeType.ARGUMENT, {value: string, quoted: boolean}>
{
	protected readonly type = NodeType.ARGUMENT;
	
	static create (value: {value: string, quoted: boolean}, start = POS_UNKNOWN, end = POS_UNKNOWN)
	{
		if (!value.quoted && Argument.stringNeedsQuotes(value.value))
			throw new CompilerError("Argument: Tried to create non-quoted argument with value that needs quotes");
		
		return new this(value, start, end);
	}
	
	static fromString (string: string, start = POS_UNKNOWN, end = POS_UNKNOWN)
	{
		const quoted = Argument.stringNeedsQuotes(string);
		
		return new this({value: string, quoted}, start, end);
	}
	
	/**
	 * if a string requires quotes to be represented in cfg source
	 */
	static stringNeedsQuotes (string: string)
	{
		// need quotes to represent this
		if (string === "")
			return true;
		
		// semicolon, whitespace, comment
		if (/[;\0-\x20]|\/\//.test(string))
			return true;
		
		// break character with other characters
		if (string.length !== 1 && /[':(){}]/.test(string))
			return true;
		
		return false;
	}
	
	/**
	 * compares values like cfg command names (case-insensitive)
	 */
	valueEquals (value: string | string[])
	{
		const myValue = this.value.value.toLowerCase();
		
		if (typeof value === "string")
			return myValue === value.toLowerCase();
		
		return value.some(v => myValue === v.toLowerCase());
	}
	
	toString ()
	{
		return this.value.quoted ? `"${this.value.value}"` : this.value.value;
	}
	
	getString ()
	{
		return this.value.value;
	}
	
	isQuoted ()
	{
		return this.value.quoted;
	}
}

export class Command extends Node<NodeType.COMMAND, (Argument | CommandList)[]>
{
	protected readonly type = NodeType.COMMAND;
	
	static create (value: (Argument | CommandList)[], start = POS_UNKNOWN, end = POS_UNKNOWN)
	{
		return new this(value, start, end);
	}
	
	toString (): string
	{
		return this.value.map(argument => argument.toString()).join(" ");
	}
	
	[Symbol.iterator] ()
	{
		return this.value[Symbol.iterator]();
	}
	
	/**
	 * gets the name of this command
	 */
	getName ()
	{
		return this.argv(0).getArgument().getString();
	}
	
	/**
	 * checks if the name of the command equals something
	 * 
	 * command names in cfg are case-insensitive
	 */
	nameEquals (names: string | string[])
	{
		return this.argv(0).getArgument().valueEquals(names);
	}
	
	pushArguments (...args: (Argument | CommandList)[])
	{
		this.value.push(...args);
	}
	
	spliceArguments (start: number, deleteCount: number, ...replacements: (Argument | CommandList)[])
	{
		return this.value.splice(start, deleteCount, ...replacements);
	}
	
	argc ()
	{
		return this.value.length;
	}
	
	argv (i: number)
	{
		if (i < 0 || !Number.isSafeInteger(i))
			throw new CompilerError("Command#argv: i is negtive or not an integer");
		if (i >= this.value.length)
			throw new CompilerError("Command#argv: i is out of range");
		
		return this.value[i];
	}
}

export class CommandList extends Node<NodeType.COMMAND_LIST, {value: Command[], toplevel: boolean}>
{
	protected readonly type = NodeType.COMMAND_LIST;
	
	static create (value: Command[], start = POS_UNKNOWN, end = POS_UNKNOWN)
	{
		return new this({value, toplevel: false}, start, end);
	}
	
	static createToplevel (value: Command[], start = POS_UNKNOWN, end = POS_UNKNOWN)
	{
		return new this({value, toplevel: true}, start, end);
	}
	
	toString ()
	{
		if (!this.value.toplevel)
			return `"${this.value.value.map(command => command.toString()).join("; ")}"`;
		return this.value.value.map(command => command.toString()).join("\n");
	}
	
	[Symbol.iterator] ()
	{
		return this.value.value[Symbol.iterator]();
	}
	
	getCommandAt (i: number)
	{
		if (i >= this.value.value.length)
			throw new CompilerError("CommandList#getCommand: i is out of range");
		
		return this.value.value[i];
	}
	
	get length ()
	{
		return this.value.value.length;
	}
	
	/**
	 * adds commands to the start of this command list
	 */
	prepend (...commands: Command[])
	{
		this.value.value.splice(0, 0, ...commands);
	}
	
	/**
	 * appends commands to this command list
	 */
	append (...commands: Command[])
	{
		this.value.value.push(...commands);
	}
	
	/**
	 * inserts commands before a child of this command list
	 */
	insertBefore (child: Command, ...commands: Command[])
	{
		const pos = this.value.value.indexOf(child);
		if (pos === -1)
			throw new Error();
		this.value.value.splice(pos, 0, ...commands);
	}
	
	/**
	 * inserts commands after a child of this command list
	 */
	insertAfter (child: Command, ...commands: Command[])
	{
		const pos = this.value.value.indexOf(child);
		if (pos === -1)
			throw new Error();
		this.value.value.splice(pos + 1, 0, ...commands);
	}
	
	/**
	 * finds all commands with the specified name
	 */
	*findAll (names: string | string[], recursive = true): IterableIterator<{command: Command, parentBlock: CommandList}>
	{
		for (const command of this)
		{
			if (command.nameEquals(names))
			{
				yield {command, parentBlock: this};
			}
			
			if (!recursive)
				continue;
			
			for (const argument of command)
			{
				if (!argument.isCommandList())
					continue;
				
				yield* argument.findAll(names);
			}
		}
	}
	
	/**
	 * finds all commands with a specified name, enters command lists first
	 */
	*findAllDepthFirst (names: string | string[]): IterableIterator<Command>
	{
		for (const command of this)
		{
			for (const argument of command)
			{
				if (!argument.isCommandList())
					continue;
				
				yield* argument.findAllDepthFirst(names);
			}
			
			if (command.nameEquals(names))
			{
				yield command;
			}
		}
	}
	
	splice (start: number, deleteCount: number, ...items: Command[])
	{
		return this.value.value.splice(start, deleteCount, ...items);
	}
	
	replaceChild (child: Command, ...newCmds: Command[])
	{
		const pos = this.value.value.indexOf(child);
		if (pos === -1)
			throw new CompilerError("CommandList#replaceChild: child is not a child of this");
		
		return this.splice(pos, 1, ...newCmds);
	}
	
	removeChild (child: Command)
	{
		return this.replaceChild(child);
	}
}