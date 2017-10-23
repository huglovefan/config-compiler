import {CommandList, Command, Argument} from "./parsing/Node.js";
import {CFGError} from "./errors.js";

interface CondAssignment
{
	condition: boolean;
	command: Command;
	parentBlock: CommandList;
}

class CondUse
{
	condition: boolean;
	command: Command;
	parentBlock: CommandList;
}

function processCondUse (
	{command, parentBlock, condition}: CondUse,
	setToTrueCommands: CommandList,
	setToFalseCommands: CommandList,
	commands: Command[],
	id: number,
	name: string,
)
{
	const block = command.argv(2).getCommandList();
	
	const useAliasName = `cond_${name}_use_${id}`;
	
	const useAliasDeclaration = Command.create([
		Argument.fromString("alias"),
		Argument.fromString(useAliasName),
		CommandList.create([]),
	]);
	
	commands.push(useAliasDeclaration);
	
	const useAliasUse = Command.create([
		Argument.fromString(useAliasName),
	]);
	
	parentBlock.replaceChild(command, useAliasUse);
	
	const blockWhenTrue = condition ? block : CommandList.create([]);
	const blockWhenFalse = !condition ? block : CommandList.create([]);
	
	setToTrueCommands.append(Command.create([
		Argument.fromString("alias"),
		Argument.fromString(useAliasName),
		blockWhenTrue,
	]));
	
	setToFalseCommands.append(Command.create([
		Argument.fromString("alias"),
		Argument.fromString(useAliasName),
		blockWhenFalse,
	]));
}

class Cond
{
	readonly name: string;
	readonly assignments = new Set<CondAssignment>();
	readonly uses = new Set<CondUse>();
	
	constructor (name: string)
	{
		this.name = name;
	}
	
	getCruft ()
	{
		const commands: Command[] = [];
		
		// todo: try to reduce the aliases
		// if there's only one assignment/use/something, try to inline things
		
		// never used -> output nothing
		if (this.uses.size === 0)
		{
			for (const assignment of this.assignments)
				assignment.parentBlock.removeChild(assignment.command);
			return commands;
		}
		
		// never assigned (to 1) -> inline the blocks
		// todo: this breaks with `else` fixing
		if (
			this.assignments.size === 0 ||
			this.assignments.size === 1 && [...this.assignments][0].condition === false
		)
		{
			for (const use of this.uses)
			{
				const block = use.command.argv(2).getCommandList();
				// remove "if"
				if (use.condition)
					use.parentBlock.removeChild(use.command);
				// replace "unless" with body
				else
					use.parentBlock.replaceChild(use.command, ...block);
			}
			return commands;
		}
		
		const setToTrueCommands = CommandList.create([]);
		const setToFalseCommands = CommandList.create([]);
		
		const setToTrueAliasName = `cond_${this.name}_set_to_true`;
		const setToFalseAliasName = `cond_${this.name}_set_to_false`;
		
		const setToTrueAlias = Command.create([
			Argument.fromString("alias"),
			Argument.fromString(setToTrueAliasName),
			setToTrueCommands,
		]);
		
		const setToFalseAlias = Command.create([
			Argument.fromString("alias"),
			Argument.fromString(setToFalseAliasName),
			setToFalseCommands,
		]);
		
		let i = 0;
		for (const use of this.uses)
			processCondUse(
				use,
				setToTrueCommands,
				setToFalseCommands,
				commands,
				++i,
				this.name,
			);
		
		const trueAssignments = [...this.assignments].filter(a => a.condition);
		const falseAssignments = [...this.assignments].filter(a => !a.condition);
		
		for (const {command, parentBlock} of trueAssignments)
		{
			if (trueAssignments.length !== 1)
				parentBlock.replaceChild(command, Command.create([
					Argument.fromString(setToTrueAliasName),
				]));
			else
				parentBlock.replaceChild(command, ...setToTrueCommands.splice(0, Infinity));
		}
		
		for (const {command, parentBlock} of falseAssignments)
		{
			if (falseAssignments.length !== 1)
				parentBlock.replaceChild(command, Command.create([
					Argument.fromString(setToFalseAliasName),
				]));
			else
				parentBlock.replaceChild(command, ...setToFalseCommands.splice(0, Infinity));
		}
		
		if (trueAssignments.length !== 1)
			commands.push(setToTrueAlias);
		
		if (falseAssignments.length !== 1)
			commands.push(setToFalseAlias);
		
		return commands;
	}
}

class CondMap
{
	readonly conds = new Map<string, Cond>();
	
	get (name: string)
	{
		name = name.toLowerCase();
		if (this.conds.has(name))
			return this.conds.get(name)!;
		const cond = new Cond(name);
		this.conds.set(name, cond);
		return cond;
	}
	
	getAllCruft ()
	{
		const result = [];
		for (const cond of this.conds.values())
			result.push(...cond.getCruft());
		return result;
	}
}

/**
 * gets the name of a cond
 * 
 * coincidentally this works for both "cond" and "if"/"unless"
 */
function getAssignmentName (command: Command)
{
	if (command.argc() < 2)
		throw CFGError.for(command, "Cond name missing");
	return command.argv(1).getArgument().getString();
}

function getAssignmentValue (command: Command)
{
	if (command.argc() < 3)
		return false;
	const valueNode = command.argv(2).getArgument();
	return !!parseFloat(valueNode.getString());
}

function condCounter (commands: CommandList, conds: CondMap)
{
	for (const {command, parentBlock} of commands.findAll(["cond"]))
	{
		const name = getAssignmentName(command);
		const condition = getAssignmentValue(command);
		conds.get(name).assignments.add({
			command,
			parentBlock,
			condition,
		});
	}
	for (const {command, parentBlock} of [...commands.findAll(["if", "unless"])])
	{
		const condition = command.nameEquals("if");
		
		const name = getAssignmentName(command);
		
		const block = command.argv(2).getCommandList();
		
		switch (command.argc())
		{
			case 1: // if
				throw CFGError.for(command, "Cond name missing");
			case 2: // if x
				throw CFGError.for(command, "Cond body missing");
			case 3: // if x { ... }
				break;
			case 4: // if x { ... } else
				{
				const fourth = command.argv(3);
				throw CFGError.unexpectedNode(fourth);
				}
			case 5: // if x { ... } else { ... }
				{
				
				/*
				alternatively, could do
				
				if test A else B
				->
				if test { cond test_was_true 1 }
				unless test { cond test_was_true 0 }
				
				if test A
				unless test_was_true B
				
				// todo: could support setting a cond to the value of one this way
				// nice idea, i upvote it
				// will have to see which way of rewriting unless is more compact
				// it could also be easier to optimize than the current else implementation?
				// since it doesn't add to the if block
				
				*/
				
				const fourth = command.argv(3).getArgument();
				if (!fourth.valueEquals("else"))
					throw CFGError.unexpectedNode(command);
				
				const preBlockCondName = `${name}_was_true`;
				const preBlockAssignment = Command.create([
					Argument.fromString("cond"),
					Argument.fromString(preBlockCondName),
					Argument.fromString("0"),
				]);
				
				const inBlockAssignment = Command.create([
					Argument.fromString("cond"),
					Argument.fromString(preBlockCondName),
					Argument.fromString("1"),
				]);
				
				const elseBlock = command.argv(4);
				const unlessStatement = Command.create([
					Argument.fromString("unless"),
					Argument.fromString(preBlockCondName),
					elseBlock,
				]);
				command.spliceArguments(3, Infinity);
				
				parentBlock.insertBefore(command, preBlockAssignment);
				block.prepend(inBlockAssignment);
				parentBlock.insertAfter(command, unlessStatement);
				
				conds.get(name).assignments.add({
					condition: false,
					command: preBlockAssignment,
					parentBlock,
				});
				conds.get(name).assignments.add({
					condition: true,
					command: inBlockAssignment,
					parentBlock: block,
				});
				conds.get(name).uses.add({
					condition: false,
					command: unlessStatement,
					parentBlock,
				});
				break;
				}
			default:
				throw CFGError.for(command, "Too many arguments to cond");
		}
		
		conds.get(name).uses.add({
			command,
			parentBlock,
			condition,
		});
	}
}

export function rewriteConditionals (commands: CommandList)
{
	// - fix else
	const conds = new CondMap();
	condCounter(commands, conds);
	commands.prepend(...conds.getAllCruft());
}