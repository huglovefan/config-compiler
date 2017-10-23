import {Node, CommandList, Command, Argument} from "./parsing/Node.js";
import {CFGError} from "./errors.js";

import Scope from "./interpreter/Scope.js";

/*

template <name> [...parameters] <body>

feature roadmap:
- done: passing templates to templates (capture declaration scope)
- spread args (at most one, doesn't have to be last)

todo:
- there should only be one scope with a ScopeItem class & errors for using the wrong type in cfg2

*/

//
//
//

enum ScopeItemType
{
	NODE,
	TEMPLATE,
}

abstract class ScopeItem <TType extends ScopeItemType, TValue>
{
	protected abstract readonly type: TType;
	protected readonly value: TValue;
	
	isNode (): this is NodeScopeItem
	{
		return this.type === ScopeItemType.NODE;
	}
	isTemplate (): this is TemplateScopeItem
	{
		return this.type === ScopeItemType.TEMPLATE;
	}
	
	getNode (): NodeScopeItem
	{
		if (!this.isNode())
			throw new Error();
		
		return this;
	}
	getTemplate (): TemplateScopeItem
	{
		if (!this.isTemplate())
			throw new Error();
		
		return this;
	}
}

class NodeScopeItem extends ScopeItem<ScopeItemType.NODE, Node<any, any>>
{
	protected readonly type = ScopeItemType.NODE;
}

class TemplateScopeItem extends ScopeItem<ScopeItemType.TEMPLATE, Template>
{
	protected readonly type = ScopeItemType.TEMPLATE;
}

//
//
//

/** any cfg2 value */
type Value = Argument | CommandList;

/** scope of template parameters */
type ValueScope = Scope<Value>;

/** scope of template declarations */
type TemplateScope = Scope<Template>;

class Template
{
	readonly name: string;
	
	private params: string[];
	private body: CommandList;
	
	private templateScope: TemplateScope;
	private paramScope: ValueScope;
	
	constructor (command: Command, templateScope: TemplateScope, paramScope: ValueScope)
	{
		this.templateScope = templateScope;
		this.paramScope = paramScope;
		
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
	getReplacement (command: Command, parentTemplateScope: TemplateScope, parentParamScope: ValueScope)
	{
		const args = [...command].slice(1);
		
		// todo: parent is just where it was used, should it be in the scope chain at all?
		
		const templateScope = new Scope(this.templateScope);
		const paramScope = new Scope(this.paramScope);
		
		for (let i = 0; i < args.length; i++)
		{
			const paramName = this.params[i];
			const valueNode = args[i];
			
			if (valueNode.isArgument() && !valueNode.isQuoted())
			{
				const argumentName = valueNode.getString();
				
				// copy into scopes for the block BUT with the name of the parameter
				
				if (parentTemplateScope.has(argumentName))
					templateScope.set(paramName, parentTemplateScope.get(argumentName));
				
				if (parentParamScope.has(argumentName))
					paramScope.set(paramName, parentParamScope.get(argumentName).clone());
				
				continue;
			}
			
			paramScope.set(paramName, valueNode);
		}
		
		const duplicate = this.body.clone();
		interpretTemplatesInBlock(duplicate, templateScope, paramScope);
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
	parentTemplateScope: TemplateScope,
	parentParamScope: ValueScope,
)
{
	const templateScope = new Scope(parentTemplateScope);
	const paramScope = new Scope(parentParamScope);
	
	for (const command of [...block])
	{
		// template declaration
		if (command.nameEquals("template"))
		{
			const template = new Template(command, templateScope, paramScope);
			templateScope.set(template.name, template);
			console.log("templates: found a declaration for %s", template.name);
			block.removeChild(command);
			continue;
		}
		
		// use of a template
		if (templateScope.has(command.getName()))
		{
			const template = templateScope.get(command.getName());
			const replacements = template.getReplacement(command, templateScope, paramScope);
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
				interpretTemplatesInBlock(arg, templateScope, paramScope);
			}
			else if (arg.isArgument() && !arg.isQuoted() && paramScope.has(arg.getString()))
			{
				console.log("templates: replaced a param to %s with name %s", command.getName(), arg.getString());
				command.replaceArgument(arg, paramScope.get(arg.getString()).clone());
			}
		}
	}
}

export function rewriteTemplates (commands: CommandList)
{
	interpretTemplatesInBlock(commands, new Scope, new Scope);
}