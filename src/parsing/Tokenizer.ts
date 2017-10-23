import {CompilerError} from "./../errors.js";

interface PatternMap
{
	[key: string]: RegExp;
}

// the ones with capturing groups are yielded as tokens
namespace Patterns
{
	export const CFG: PatternMap =
	{
		Newline:     /(\n)/y,
		Whitespace:  /(?:(?!\n)[\0-\x20])+/y, // don't consume newlines
		LineComment: /\/\/(?:([^\n]*)\n|[^\n]*$)/y, // capture if newline
		Separator:   /(;)/y,
		Break:       /([':(){}])/y,
		String:      /"([^"\n]*)"?/y,
		Symbol:      /((?:(?!\/\/)[^\0-\x20;':(){}"])+)/y, // not WS, CMT, SEP, BRK or STR
		Eof:         /($)/y,
	};
	
	export const CFG2: PatternMap =
	{
		Newline:      CFG.Newline,
		Whitespace:   CFG.Whitespace,
		LineComment:  CFG.LineComment,
		BlockComment: /\/\*(?:((?:(?!\*\/)[^\n])*?\n[^]*?)|[^]*?)(?:$|\*\/)/y, // capture if newline
		BlockStart:   /(\{)/y,
		BlockEnd:     /(\})/y,
		ParenStart:   /(\()/y,
		ParenEnd:     /(\))/y,
		Separator:    CFG.Separator,
		Break:        CFG.Break,
		String:       CFG.String,
		Symbol:       /((?:(?!\/[\/\*])[^\0-\x20;':(){}"])+)/y, // not WS, *CMT, SEP, BRK or STR
		Eof:          CFG.Eof,
	};
}

export class Token
{
	readonly type: string;
	readonly value: string;
	readonly start: number;
	readonly end: number;
	
	constructor (type: string, value: string, start: number, end: number)
	{
		this.type = type;
		this.value = value;
		this.start = start;
		this.end = end;
	}
	
	is (types: string | string[])
	{
		if (typeof types === "string")
			return this.type === types;
		
		return (types.indexOf(this.type) !== -1);
	}
}

class Options
{
	cfg2 = true;
	sourceOffset = 0;
	
	static create (partial?: Partial<Options>)
	{
		const options = new this();
		if (partial !== undefined)
			Object.assign(options, partial);
		return options;
	}
}

export class Tokenizer
{
	readonly source: string;
	
	private readonly options: Options;
	
	private i: number;
	private readonly patterns: PatternMap;
	
	private current_: Token;
	private next_: Token | null;
	
	constructor (source: string, options?: Partial<Options>)
	{
		this.source = source;
		
		this.options = Options.create(options);
		
		this.i = 0;
		this.patterns = (this.options.cfg2) ? Patterns.CFG2 : Patterns.CFG;
		
		this.current_ = this.getNext();
		this.next_ = null;
	}
	
	get current ()
	{
		return this.current_;
	}
	
	get next ()
	{
		if (this.next_ === null)
			this.next_ = this.getNext();
		
		return this.next_;
	}
	
	/**
	 * goes forward a token and returns the previous "current token"
	 */
	advance ()
	{
		const result = this.current_;
		
		if (this.next_ !== null)
			[this.current_, this.next_] = [this.next_, null];
		else
			this.current_ = this.getNext();
		
		return result;
	}
	
	/**
	 * if the current token matches the type,
	 * advances by one token and returns the matching token
	 */
	eat (types: string | string[])
	{
		if (this.current.is(types))
			return this.advance();
		
		return null;
	}
	
	private getNext (): Token
	{
		const start = this.i;
		
		for (const patternName in this.patterns)
		{
			const pattern = this.patterns[patternName];
			if (!pattern.sticky)
				throw new CompilerError("Tokenizer: Pattern is not sticky");
			
			pattern.lastIndex = this.i;
			
			const match = pattern.exec(this.source);
			if (match === null)
				continue;
			
			this.i += match[0].length;
			
			// no capturing group or it wasn't captured
			if (match.length < 2 || match[1] === undefined)
				return this.getNext();
			
			return new Token(
				patternName,
				match[1],
				start + this.options.sourceOffset,
				this.i + this.options.sourceOffset
			);
		}
		
		throw new CompilerError("Tokenizer: No matching patterns");
	}
}