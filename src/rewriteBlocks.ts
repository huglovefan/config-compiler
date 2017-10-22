import {CompilerError, CFGError} from "./errors.js";
import {CommandList, Command, Argument} from "./parsing/Node.js";

import {Tokenizer} from "./parsing/Tokenizer.js";
import {Parser} from "./parsing/Parser.js";

/**
 * parses a string Argument into a non-toplevel block with correct source positions
 */
function stringArgToBlock (arg: Argument)
{
	const options = {cfg2: false, sourceOffset: arg.start + '"'.length};
	const tokenizer = new Tokenizer(arg.getString(), options);
	const commandList = new Parser(tokenizer).parse();
	(<any> commandList).value.toplevel = false;
	return commandList;
}

/**
 * makes block args consistent
 * ```
 * alias a "test"
 * alias a test
 * // ->
 * alias a { test }
 * ```
 */
function fixBlockArg (commands: CommandList, commandName: string, blockArgPos: number)
{
	for (const {command} of commands.findAll(commandName))
	{
		if (command.argc() < blockArgPos)
			continue;
		
		const blockArgCount = command.argc() - blockArgPos;
		const firstBlockArg = command.argv(blockArgPos);
		
		if
		(
			blockArgCount === 1 &&
			firstBlockArg.isCommandList()
		)
		{
			// just one block -> already ok
		}
		else if
		(
			blockArgCount === 1 &&
			firstBlockArg.isArgument() &&
			firstBlockArg.isQuoted()
		)
		{
			// just one string -> parse it as cfg
			const block = stringArgToBlock(firstBlockArg);
			command.spliceArguments(blockArgPos, 1, block);
		}
		else
		{
			// anything else -> assume parts of single command
			
			if (!firstBlockArg.isArgument())
				throw CFGError.unexpectedNode(firstBlockArg);
			
			const start = firstBlockArg.start;
			const end = command.end;
			
			command.pushArguments(
				CommandList.create([
					Command.create([
						...command.spliceArguments(blockArgPos, Infinity)
					], start, end)
				], start, end)
			);
		}
	}
}

/**
 * for an alias with a block containing a single command,
 * merges the command with the alias command to skip a level of quotes
 */
function mergeSingleCommandAliasBlock (command: Command)
{
	if (command.argc() !== 3)
		throw new CompilerError();
	
	const block = command.spliceArguments(2, 1)[0];
	
	if (!block.isCommandList())
		throw new CompilerError();
	if (block.length !== 1)
		throw new CompilerError();
	
	const parts = [...block.getCommandAt(0)];
	
	command.pushArguments(...parts);
}

/**
 * if a command needs quotes in some part of it to appear in cfg source
 */
function commandNeedsQuotes ([...command]: Command)
{
	for (const arg of command)
	{
		if (arg.isArgument())
		{
			if (arg.isQuoted())
				return true;
		}
		else
		{
			if (commandListNeedsQuotes(arg))
				return true;
		}
	}
	return false;
}

/**
 * if a command list needs to be quoted to appear in cfg source
 * 
 * (most need quotes)
 */
function commandListNeedsQuotes ([...commandList]: CommandList)
{
	// empty string, will need quotes
	if (commandList.length === 0)
		return true;
	
	// will need semicolons
	if (commandList.length > 1)
		return true;
	
	const [cmd] = commandList;
	
	// will need spaces
	if (cmd.argc() > 1)
		return true;
	
	const [arg] = cmd;
	
	if (!arg.isArgument())
		throw new CompilerError("command name is not an argument");
	
	return arg.isQuoted();
}

type AddAlias = (list: CommandList) => string;

function rewriteBlocks_processCommandList
(
	commands: CommandList,
	willBeQuoted: boolean,
	addAlias: AddAlias | undefined,
)
{
	// cache an empty temp alias
	// todo: deduping for common aliases
	let emptyBlockAliasName: string | null = null;
	
	let i = 0;
	for (const {command} of [...commands.findAll(["alias", "bind"], false)])
	{
		const addAliasArg = (addAlias !== undefined) ? addAlias : (
			(block: CommandList) =>
			{
				if (block.length === 0 && emptyBlockAliasName !== null)
					return emptyBlockAliasName;
				
				const tempAliasName = "temp_" + String(i++);
				const tempAlias = Command.create([
					Argument.fromString("alias"),
					Argument.fromString(tempAliasName),
					block,
				]);
				commands.insertBefore(command, tempAlias);
				rewriteBlocks_processCommand(tempAlias, false, addAliasArg);
				
				if (block.length === 0 && emptyBlockAliasName === null)
					emptyBlockAliasName = tempAliasName;
				
				return tempAliasName;
			}
		);
		
		rewriteBlocks_processCommand(command, willBeQuoted, addAliasArg);
	}
}

function rewriteBlocks_processCommand (
	command: Command,
	willBeQuoted: boolean,
	addAlias: AddAlias,
)
{
	if (!command.nameEquals(["alias", "bind"]))
		throw new CompilerError("command is not alias or bind");
	
	const nameNode = command.argv(1);
	if (!nameNode.isArgument())
		throw new CompilerError("alias/bind name is not an argument");
	
	const description = command.getName() + " " + nameNode.getString();
	
	const block = command.argv(2);
	
	if (!block.isCommandList())
		throw new CompilerError("second arg not a command list");
	
	// todo: does willBeQuoted affect this?
	if (block.length === 1 && command.nameEquals("alias"))
	{
		// alias just copies the rest of the arguments,
		// which can be used to skip a level of quotes
		
		// it will be merged later
		
		// console.log("%s has one command -> merging, skipping quotes",
		// 	description);
		
		rewriteBlocks_processCommandList(block, willBeQuoted || false, addAlias);
		
		return;
	}
	
	if (willBeQuoted)
	// if (0)
	{
		// this alias will be quoted, so lift the body to make it quotable
		
		// not doing this saves a few bytes and has nicer output with the same line count
		// i wonder if it'd be possible to automatically choose the better option
		
		// xxx: then i added the empty alias caching, and now doing this is preferable
		
		rewriteBlocks_processCommandList(block, false, addAlias);
		
		if (!commandListNeedsQuotes(block))
		{
			// the body will be merged later
			
			// console.log("%s will be quoted BUT body doesn't need quotes -> merging body",
			// 	description);
			
			return;
		}
		
		const tempAliasName = addAlias(block);
		
		console.log("%s will be quoted -> lifting body into alias %s",
			description,
			tempAliasName);
		
		command.spliceArguments(2, 1, CommandList.create([
			Command.create([
				Argument.fromString(tempAliasName)
			])
		]));
	}
	else
	{
		// this alias will NOT be quoted, but the body will
		// lift any commands from the body that need quotes
		
		console.assert(commandListNeedsQuotes(block), "commandListNeedsQuotes(block)");
		
		// process aliases inside the block, signify that it will be quoted
		rewriteBlocks_processCommandList(block, true, addAlias);
		
		for (const command of block)
		{
			if (!commandNeedsQuotes(command))
			{
				// command already doesn't need quotes
				continue;
			}
			
			const tempAliasName = addAlias(CommandList.create([command]));
			
			console.log("command %s needs quotes -> lifting into alias %s",
				command.getName(),
				tempAliasName);
			
			const tempAliasUse = Command.create([
				Argument.fromString(tempAliasName),
			]);
			
			block.replaceChild(command, tempAliasUse);
		}
	}
}

/**
 * rewrites blocks into ones that can be directly represented as cfg
 * (no nesting, no quoted things in blocks)
 * 
 * they're still blocks instead of quoted arguments but just use toString on the commands
 * 
 * (this is the optimization for turning it into cfg)
 */
export function rewriteBlocks (commands: CommandList)
{
	rewriteBlocks_processCommandList(commands, false, undefined);
	
	for (const command of commands.findAllDepthFirst(["alias", "bind"]))
	{
		const name = command.argv(1);
		
		if (!name.isArgument())
			throw CFGError.unexpectedNode(name);
		
		// const description = command.getName() + " " + name.getString();
		
		const block = <CommandList> command.argv(2);
		if (command.nameEquals("alias"))
		{
			if (block.length !== 1)
				continue;
			
			mergeSingleCommandAliasBlock(command);
			
			// console.log("%s has a single command -> merging body", description);
		}
		else
		{
			if (commandListNeedsQuotes(block))
				continue;
			
			mergeSingleCommandAliasBlock(command);
			
			// console.log("%s body doesn't need quotes -> merging", description);
		}
	}
}

export function fixBlockArgs (commands: CommandList)
{
	fixBlockArg(commands, "alias", 2);
	fixBlockArg(commands, "bind", 2);
}