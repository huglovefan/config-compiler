import {Tokenizer} from "./parsing/Tokenizer.js";
import {Parser} from "./parsing/Parser.js";
import {CommandList} from "./parsing/Node.js";

import {fixBlockArgs, rewriteBlocks} from "./rewriteBlocks.js";
import {rewriteTemplates} from "./rewriteTemplates.js";
import {rewriteDo} from "./rewriteDo.js";
import {rewriteEchoSay} from "./rewriteEchoSay.js";
import {rewriteConditionals} from "./rewriteConditionals.js";

export class Compiler
{
	readonly source: string;
	private commands: CommandList | null;
	
	constructor (source: string)
	{
		this.source = source;
		this.commands = null;
	}
	
	getCommands ()
	{
		if (this.commands !== null)
			return this.commands;
		
		const tokenizer = new Tokenizer(this.source);
		const parser = new Parser(tokenizer);
		const commands = parser.parse();
		
		rewriteTemplates(commands);
		rewriteDo(commands);
		fixBlockArgs(commands);
		rewriteConditionals(commands);
		rewriteEchoSay(commands);
		rewriteBlocks(commands); // optimizes blocks, do this last
		
		this.commands = commands;
		return commands;
	}
	
	getString ()
	{
		return this.getCommands().toString();
	}
}