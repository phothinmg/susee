import ts, { isFunctionDeclaration, isFunctionTypeNode } from "typescript";

interface AstHook {
  type: "ast";
  async: boolean;
  func: (
    node: ts.Node,
    t: typeof ts,
    context: ts.TransformationContext,
    factory: ts.NodeFactory,
  ) => ts.Node;
}

interface PreHook{
    type:"pre-process";
    async: boolean;
}

