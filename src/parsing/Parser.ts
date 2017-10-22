import {Tokenizer} from "./Tokenizer.js";
import {CommandList, Command, Argument} from "./Node.js";

import {CompilerError, CFGError} from "./../errors.js";

export class Parser
{
	private readonly tokenizer: Tokenizer;
	
	constructor (tokenizer: Tokenizer)
	{
		this.tokenizer = tokenizer;
	}
	
	parse ()
	{
		return this.parseConfig();
	}
	
	private parseConfig ()
	{
		const commands = CommandList.createToplevel([], this.tokenizer.current.start);
		
		while (true)
		{
			if (this.tokenizer.eat(["Separator", "Newline", "LineComment", "BlockComment"]))
				continue;
			
			if (this.tokenizer.current.is("Eof"))
				break;
			
			const command = this.parseCommand();
			
			if (command === null)
				throw CFGError.unexpectedToken(this.tokenizer.current);
			
			commands.append(command);
		}
		
		commands.end = this.tokenizer.current.end;
		
		return commands;
	}
	
	private parseBlock ()
	{
		const commands = CommandList.create([], this.tokenizer.current.start);
		
		if (!this.tokenizer.eat("BlockStart"))
			throw new CompilerError("Parser: Tried to parse a block while not at a block");
		
		while (true)
		{
			if (this.tokenizer.eat(["Separator", "Newline", "LineComment", "BlockComment"]))
				continue;
			
			if (this.tokenizer.current.is(["Eof", "BlockEnd"]))
				break;
			
			const command = this.parseCommand();
			
			if (command === null)
				throw CFGError.unexpectedToken(this.tokenizer.current);
			
			commands.append(command);
		}
		
		commands.end = this.tokenizer.current.end;
		
		const blockEnd = this.tokenizer.eat("BlockEnd");
		if (blockEnd === null)
			throw CFGError.for(commands, "Unclosed block");
		
		return commands;
	}
	
	private parseCommand ()
	{
		const command = Command.create([], this.tokenizer.current.start);
		
		while (true)
		{
			if (this.tokenizer.current.is(["Symbol", "String", "Break"]))
			{
				const token = this.tokenizer.advance();
				const {value, start, end} = token;
				const argument = Argument.create({
					value,
					quoted: token.is("String"),
				}, start, end);
				command.pushArguments(argument);
			}
			else if (this.tokenizer.current.is("BlockStart"))
			{
				const block = this.parseBlock();
				command.pushArguments(block);
			}
			else
			{
				break;
			}
		}
		
		if (command.argc() === 0)
			return null;
		
		command.end = command.argv(command.argc() - 1).end;
		
		return command;
	}
}