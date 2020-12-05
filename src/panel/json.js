import React from "react";
import CodeMirror from "codemirror";
import jsMode from "codemirror/mode/javascript/javascript";
import matchBrackets from "codemirror/addon/edit/matchbrackets";
import compact from "json-stringify-pretty-compact";
import zoomextent from "../lib/zoomextent";
import { hint } from "@mapbox/geojsonhint";
import equal from "deep-equal";

const copyAvailable = (() => {
  return (
    !!document.queryCommandSupported && document.queryCommandSupported("copy")
  );
})();

function copy(text) {
  var fakeElem = document.body.appendChild(document.createElement("textarea"));
  fakeElem.style.position = "absolute";
  fakeElem.style.left = "-9999px";
  fakeElem.setAttribute("readonly", "");
  fakeElem.value = text;
  fakeElem.select();
  try {
    return document.execCommand("copy");
  } catch (err) {
    return false;
  } finally {
    fakeElem.parentNode.removeChild(fakeElem);
  }
}

function maybeParse(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return new Error("could not parse");
  }
}

const formatters = {
  compact,
  stringify: val => JSON.stringify(val, null, 2)
};

export default class Code extends React.Component {
  state = {
    error: undefined,
    formatFn: "compact"
  };
  constructor(props) {
    super(props);
    this.codeMirrorContainer = React.createRef();
  }
  maybeChange = (editor, changeObj) => {
    const { setGeojson } = this.props;
    const val = editor.getValue();
    const err = hint(val);
    editor.clearGutter("error");
    
    if (err instanceof Error) {
      this.handleJsonError(editor, err.message);
    } else if (err.length) {
      this.handleGeoJSONError(editor, err);
    }
    if (!(err instanceof Error || !err.every(e => !e.message))) {
      console.log("valid geojson, sending");
      const zoom =
        changeObj.from.ch === 0 &&
        changeObj.from.line === 0 &&
        changeObj.origin == "paste";
      try {
        return setGeojson(JSON.parse(val), "cm");
      } catch (e) {
        console.error(e);
        this.setState({
          error: {
            class: "icon-circle-blank",
            title: "invalid GeoJSON",
            message: "invalid GeoJSON"
          }
        });
      }
    }
  };
  handleGeoJSONError(editor, errors) {
    editor.clearGutter("error");
    errors.forEach(e => {
      editor.setGutterMarker(e.line, "error", this.makeMarker(e.message));
    });
    this.setState({
      error: {
        class: "icon-circle-blank",
        title: "invalid GeoJSON",
        message: "invalid GeoJSON"
      }
    });
  }
  handleJsonError(editor, msg) {
    var match = msg.match(/line (\d+)/);
    if (match && match[1]) {
      editor.clearGutter("error");
      editor.setGutterMarker(
        parseInt(match[1], 10) - 1,
        "error",
        this.makeMarker(msg)
      );
    }
    this.setState({
      error: {
        class: "icon-circle-blank",
        title: "invalid JSON",
        message: "invalid JSON"
      }
    });
  }
  makeMarker(msg) {
    const div = document.createElement("div");
    div.className = "error-marker";
    div.setAttribute("message", msg);
    return div;
  }
  componentDidMount() {
    const { formatFn } = this.state;
    const { geojson } = this.props;
    const node = this.codeMirrorContainer.current;

    CodeMirror.keyMap.tabSpace = {
      Tab: cm => {
        var spaces = new Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces, "end", "+input");
      },
      // "Ctrl-S": saveAction,
      // "Cmd-S": saveAction,
      fallthrough: ["default"]
    };
    const editor = new CodeMirror(node, {
      mode: "application/json",
      matchBrackets: true,
      tabSize: 2,
      gutters: ["error"],
      autofocus: window === window.top,
      keyMap: "tabSpace",
      lineNumbers: true,
      theme: "idea"
    });
    editor.setValue(formatters[formatFn](geojson));
    editor.on("change", this.maybeChange);
    this.setState({
      editor
    });
  }
  componentDidUpdate(prevProps, prevState) {
    const { editor, formatFn } = this.state;
    const { geojson, changeFrom } = this.props;
    if (
      (changeFrom !== "cm" && geojson !== prevProps.geojson) ||
      formatFn !== prevState.formatFn
    ) {
      editor.off("change", this.maybeChange);
      editor.setValue(formatters[formatFn](geojson));
      editor.on("change", this.maybeChange);
    }
  }
  copy = () => {
    const { editor } = this.state;
    copy(editor.getValue());
  };
  setFormatFn = e => {
    this.setState({
      formatFn: e.target.value
    });
  };
  render() {
    const { formatFn } = this.state;
    const { copy } = this;
    return (
      <div className="flex flex-auto flex-column">
        <div className="flex-auto flex fw5" ref={this.codeMirrorContainer} />
        <div
          className="bt inline-flex items-center"
          style={{
            flexShrink: "0"
          }}
        >
          {copyAvailable && (
            <span className="db pointer bn pa2 hover-bg-yellow" onClick={copy}>
              Copy to clipboard
            </span>
          )}
          <div className="ml1">
            <select
              onChange={this.setFormatFn}
              value={formatFn}
              className="ml1 bg-white"
              style={{
                fontFamily: "inherit",
                fontWeight: "inherit"
              }}
            >
              <option value="compact">compact format</option>
              <option value="stringify">JSON.stringify</option>
            </select>
          </div>
        </div>
      </div>
    );
  }
}
