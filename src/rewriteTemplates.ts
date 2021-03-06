import {CommandList, Command, Argument} from "./parsing/Node.js";
import {CFGError} from "./errors.js";

import Scope from "./interpreter/Scope.js";

/*

template <name> [...parameters] <body>

feature roadmap:
- done: passing templates to templates (capture declaration scope)
- spread args (at most one, doesn't have to be last)

todo:
- there should only be one scope with a ScopeItem class & errors for using the wrong type in cfg2
- have a list type (replace something with it, i forgot)
- also make a scope entry for xs for ...xs to be able to test it when passed to a template
- "define <name> <literal>"
- "define-list <name> [...items]"

*/

//
//
//

enum ScopeItemType
{
	NODE,
	SPREAD,
	LITERAL,
	TEMPLATE,
}

abstract class ScopeItem <TType extends ScopeItemType, TValue>
{
	protected abstract readonly type: TType;
	protected readonly value: TValue;
	
	constructor (value: TValue)
	{
		this.value = value;
	}
	
	isNode (): this is NodeScopeItem
	{
		return this.type === ScopeItemType.NODE;
	}
	isSpread (): this is SpreadScopeItem
	{
		return this.type === ScopeItemType.SPREAD;
	}
	isLiteral (): this is LiteralScopeItem
	{
		return this.type === ScopeItemType.LITERAL;
	}
	isTemplate (): this is TemplateScopeItem
	{
		return this.type === ScopeItemType.TEMPLATE;
	}
	
	getNode ()
	{
		if (!this.isNode())
			throw new Error();
		
		return <Argument | CommandList> (<any> this).value;
	}
	getNodeOrLiteral (): Argument | CommandList
	{
		if (!this.isNode() && !this.isLiteral())
			throw new Error();
		
		return <Argument | CommandList> (<any> this).value;
	}
	getSpread ()
	{
		if (!this.isSpread())
			throw new Error();
		
		return <(Argument | CommandList)[]> (<any> this).value;
	}
	getLiteral ()
	{
		if (!this.isLiteral())
			throw new Error();
		
		return <Argument | CommandList> (<any> this).value;
	}
	getTemplate ()
	{
		if (!this.isTemplate())
			throw new Error();
		
		return <Template> (<any> this).value;
	}
}

class NodeScopeItem extends ScopeItem<ScopeItemType.NODE, Argument | CommandList>
{
	protected readonly type = ScopeItemType.NODE;
}

class SpreadScopeItem extends ScopeItem<ScopeItemType.SPREAD, (Argument | CommandList)[]>
{
	protected readonly type = ScopeItemType.SPREAD;
}

class LiteralScopeItem extends ScopeItem<ScopeItemType.LITERAL, Argument | CommandList>
{
	protected readonly type = ScopeItemType.LITERAL;
}

class TemplateScopeItem extends ScopeItem<ScopeItemType.TEMPLATE, Template>
{
	protected readonly type = ScopeItemType.TEMPLATE;
}

//
//
//

class Template
{
	readonly name: string;
	
	private params: string[];
	private body: CommandList;
	
	private declarationScope: Scope<ScopeItem<any, any>>;
	
	constructor (command: Command, declarationScope: Scope<ScopeItem<any, any>>)
	{
		this.declarationScope = declarationScope;
		
		this.name = command.argv(1).getArgument().getString();
		
		const args = [...command].slice(2);
		const [body, ...paramsReversed] = args.reverse(); // can only use spread on the last item
		
		const paramNames = paramsReversed
			.reverse()
			.map(n => n.getArgument().getString());
		
		if (body === undefined)
			throw CFGError.for(command, "Template body missing");
		
		this.params = paramNames;
		this.body = body.getCommandList();
		
		console.log("templates: created template %s with %s parameters", this.name, this.params.length);
	}
	
	/**
	 * creates a clone of the body for the command
	 */
	getReplacement (command: Command, useScope: Scope<ScopeItem<any, any>>)
	{
		const args: (Argument | CommandList | LiteralScopeItem)[] = [...command].slice(1);
		const params = [...this.params];
		const cloneScope = new Scope(this.declarationScope);
		
		while (params.length)
		{
			const preValueNode = args[0]
			if (
				preValueNode !== undefined &&
				!(preValueNode instanceof LiteralScopeItem) &&
				preValueNode.isArgument() &&
				!preValueNode.isQuoted() &&
				preValueNode.getString().startsWith("...") &&
				useScope.has(preValueNode.getString())
			)
			{
				const spread = useScope.get(preValueNode.getString()).getSpread();
				console.log("spread '%s' in use of %s to %s items", preValueNode.getString(), this.name, spread.length);
				console.log("before the splice, args:", args);
				console.log("before the splice, names:", params);
				// this or get the values and make them literals
				// yeah i should be looping here
				// wait no, this isn't the top loop anymore
				// mark them as literals somehow
				// looks like splice is unsound and the error is because of that
				args.splice(0, 1, ...spread.map(n =>
				{
					if (n.isArgument())
						return new LiteralScopeItem(n);
					return n;
				}));
				/* const names = params.splice(0, spread.length);
				for (let i = 0; i < names.length; i++)
				{
					cloneScope.set(names[i], new LiteralScopeItem(spread[i]));
				} */
				console.log("after the splice, args:", args);
				console.log("after the splice, names:", params);
				//cloneScope.set(preValueNode.getString(), new SpreadScopeItem(spread));
				continue;
			}
			
			const paramName = params.shift()!;
			console.assert(!!paramName);
			
			if (paramName.startsWith("..."))
			{
				console.log("found spread parameter: %s", paramName);
				
				const spreadName = paramName;
				
				const argsAfterThis = (args.length - 1);
				const paramsAfterThis = (params.length - 1);
				const leftToSpread = argsAfterThis - paramsAfterThis;
				
				console.log("spread %s will capture %s items",
					spreadName, leftToSpread);
				
				const spread = args.splice(0, leftToSpread).map(n => n instanceof LiteralScopeItem ? n.getLiteral() : n);
				
				cloneScope.set(spreadName, new SpreadScopeItem(spread));
				
				continue;
			}
			
			let valueNode = args.shift()!;
			
			if (valueNode instanceof LiteralScopeItem)
			{
				cloneScope.set(paramName, valueNode);
				continue;
			}
			
			if (!valueNode)
				throw CFGError.for(command, "Too few arguments");
			
			if (valueNode.isArgument() && !valueNode.isQuoted())
			{
				const argumentName = valueNode.getString();
				
				console.log("got a possible parameter argument for %s: %s", paramName, argumentName);
				
				// copy into scopes for the block BUT with the name of the parameter
				
				if (useScope.has(argumentName))
					cloneScope.set(paramName, useScope.get(argumentName));
				
				continue;
			}
			
			console.log("got a block or string parameter for %s", paramName);
			
			cloneScope.set(paramName, new NodeScopeItem(valueNode));
		}
		
		const duplicate = this.body.clone();
		interpretTemplatesInBlock(duplicate, cloneScope);
		return duplicate;
	}
}

/**
 * interprets all templates in a block
 * 
 * finds declarations, and repalces uses
 */
function interpretTemplatesInBlock
(
	block: CommandList,
	parentScope: Scope<ScopeItem<any, any>>,
)
{
	const scope = new Scope(parentScope);
	
	for (const command of [...block])
	{
		// template declaration
		if (command.nameEquals("template"))
		{
			const template = new Template(command, scope);
			scope.set(template.name, new TemplateScopeItem(template));
			console.log("templates: found a declaration for %s", template.name);
			block.removeChild(command);
			continue;
		}
		
		if (command.nameEquals("if"))
		{
			const condition = command.argv(1).getArgument().getString();
			
			const dotted = "..." + condition;
			
			if (scope.has(dotted))
			{
				const ifBlock = command.argv(2).getCommandList();
				const hasIt = (scope.get(dotted).getSpread().length !== 0);
				if (hasIt)
				{
					interpretTemplatesInBlock(ifBlock, new Scope(scope));
					block.replaceChild(command, ...ifBlock);
				}
				else
				{
					block.removeChild(command);
				}
				
				continue;
			}
		}
		
		// use of a template
		if (scope.has(command.getName()))
		{
			const template = scope.get(command.getName()).getTemplate();
			const replacements = template.getReplacement(command, scope);
			console.log("templates: replaced a use of %s", template.name);
			block.replaceChild(command, ...replacements);
			continue;
		}
		
		// other command, replace arguments
		for (const arg of command)
		{
			if (arg.isCommandList())
			{
				console.log("templates: recursing into a block argument of %s", command.getName());
				interpretTemplatesInBlock(arg, scope);
			}
			else if (arg.isArgument() && !arg.isQuoted())
			{
				const s = arg.getString();
				if (!scope.has(s))
					continue;
				
				if (!scope.get(s).isSpread())
				{
					const node = scope.get(arg.getString()).getNodeOrLiteral();
					if (!node.isArgument() && !node.isCommandList())
						throw new Error();
					command.replaceArgument(arg, node.clone());
				}
				else
				{
					const node = scope.get(arg.getString()).getSpread();
					command.replaceArgument(arg, ...node.map(n => n.clone()));
				}
				
				console.log("templates: replaced a param to %s with name %s", command.getName(), arg.getString());
			}
		}
	}
}

export function rewriteTemplates (commands: CommandList)
{
	interpretTemplatesInBlock(commands, new Scope);
}