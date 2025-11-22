import * as React from "react";
import React__default, { useCallback } from "react";
import { useEditorContext, useSchemaContext, useExecutionContext, useOptimisticState, useOperationsEditorState } from "@graphiql/react";
import { Explorer } from "graphiql-explorer";
const SvgArrow = ({
  title,
  titleId,
  ...props
}) => /* @__PURE__ */ React.createElement("svg", { width: 5, height: 8, viewBox: "0 0 5 8", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", "aria-labelledby": titleId, ...props }, title ? /* @__PURE__ */ React.createElement("title", { id: titleId }, title) : null, /* @__PURE__ */ React.createElement("path", { d: "M0.910453 6.86965L3.88955 3.89061C4.09782 3.68233 4.09782 3.34465 3.88955 3.13637L0.910453 0.157278C0.574475 -0.178701 0 0.0592511 0 0.534408V6.49259C0 6.96768 0.574475 7.20565 0.910453 6.86965Z" }));
const SvgFolderPlus = ({
  title,
  titleId,
  ...props
}) => /* @__PURE__ */ React.createElement("svg", { height: "1em", strokeWidth: 1.5, viewBox: "0 0 24 24", stroke: "currentColor", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-labelledby": titleId, ...props }, title ? /* @__PURE__ */ React.createElement("title", { id: titleId }, title) : null, /* @__PURE__ */ React.createElement("path", { d: "M18 6H20M22 6H20M20 6V4M20 6V8", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M21.4 20H2.6C2.26863 20 2 19.7314 2 19.4V11H21.4C21.7314 11 22 11.2686 22 11.6V19.4C22 19.7314 21.7314 20 21.4 20Z", strokeLinecap: "round", strokeLinejoin: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M2 11V4.6C2 4.26863 2.26863 4 2.6 4H8.77805C8.92127 4 9.05977 4.05124 9.16852 4.14445L12.3315 6.85555C12.4402 6.94876 12.5787 7 12.722 7H14", strokeLinecap: "round", strokeLinejoin: "round" }));
const SvgCheckboxUnchecked = ({
  title,
  titleId,
  ...props
}) => /* @__PURE__ */ React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 15 15", xmlns: "http://www.w3.org/2000/svg", stroke: "currentColor", fill: "none", "aria-labelledby": titleId, ...props }, title ? /* @__PURE__ */ React.createElement("title", { id: titleId }, title) : null, /* @__PURE__ */ React.createElement("circle", { cx: 7.5, cy: 7.5, r: 6, strokeWidth: 2 }));
const SvgCheckboxChecked = ({
  title,
  titleId,
  ...props
}) => /* @__PURE__ */ React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 15 15", xmlns: "http://www.w3.org/2000/svg", fill: "currentColor", "aria-labelledby": titleId, ...props }, title ? /* @__PURE__ */ React.createElement("title", { id: titleId }, title) : null, /* @__PURE__ */ React.createElement("circle", { cx: 7.5, cy: 7.5, r: 7.5 }), /* @__PURE__ */ React.createElement("path", { d: "M4.64641 7.00106L6.8801 9.23256L10.5017 5.61325", stroke: "white", strokeWidth: 1.5 }));
const colors = {
  keyword: "hsl(var(--color-primary))",
  def: "hsl(var(--color-tertiary))",
  property: "hsl(var(--color-info))",
  qualifier: "hsl(var(--color-secondary))",
  attribute: "hsl(var(--color-tertiary))",
  number: "hsl(var(--color-success))",
  string: "hsl(var(--color-warning))",
  builtin: "hsl(var(--color-success))",
  string2: "hsl(var(--color-secondary))",
  variable: "hsl(var(--color-secondary))",
  atom: "hsl(var(--color-tertiary))"
};
const arrowOpen = /* @__PURE__ */ React__default.createElement(SvgArrow, { style: { width: "var(--px-16)", transform: "rotate(90deg)" } });
const arrowClosed = /* @__PURE__ */ React__default.createElement(SvgArrow, { style: { width: "var(--px-16)" } });
const checkboxUnchecked = /* @__PURE__ */ React__default.createElement(SvgCheckboxUnchecked, { style: { marginRight: "var(--px-4)" } });
const checkboxChecked = /* @__PURE__ */ React__default.createElement(
  SvgCheckboxChecked,
  {
    style: { fill: "hsl(var(--color-info))", marginRight: "var(--px-4)" }
  }
);
const styles = {
  buttonStyle: {
    cursor: "pointer",
    fontSize: "2em",
    lineHeight: 0
  },
  explorerActionsStyle: {
    paddingTop: "var(--px-16)"
  },
  actionButtonStyle: {}
};
function ExplorerPlugin(props) {
  const { setOperationName } = useEditorContext({ nonNull: true });
  const { schema } = useSchemaContext({ nonNull: true });
  const { run } = useExecutionContext({ nonNull: true });
  const handleRunOperation = useCallback(
    (operationName) => {
      if (operationName) {
        setOperationName(operationName);
      }
      run();
    },
    [run, setOperationName]
  );
  const [operationsString, handleEditOperations] = useOptimisticState(
    useOperationsEditorState()
  );
  return /* @__PURE__ */ React__default.createElement(
    Explorer,
    {
      schema,
      onRunOperation: handleRunOperation,
      explorerIsOpen: true,
      colors,
      arrowOpen,
      arrowClosed,
      checkboxUnchecked,
      checkboxChecked,
      styles,
      query: operationsString,
      onEdit: handleEditOperations,
      ...props
    }
  );
}
function explorerPlugin(props) {
  return {
    title: "GraphiQL Explorer",
    icon: SvgFolderPlus,
    content: () => /* @__PURE__ */ React__default.createElement(ExplorerPlugin, { ...props })
  };
}
export {
  explorerPlugin
};
