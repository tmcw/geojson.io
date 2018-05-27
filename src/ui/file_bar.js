import React from "react";
import L from "leaflet";
import keybinding from "../../lib/d3.keybinding";
import shpwrite from "shp-write";
import wkx from "wkx";
import clone from "clone";
import geojson2dsv from "geojson2dsv";
import togpx from "togpx";
import polyline from "@mapbox/polyline";
import topojson from "topojson";
import { saveAs } from "file-saver";
import tokml from "tokml";
import githubBrowser from "./file_browser.js";
import gistBrowser from "@mapbox/gist-map-browser";
import geojsonNormalize from "geojson-normalize";
import wellknown from "wellknown";
import config from "../config.js";
import readFile from "../lib/readfile";
import geojsonRandom from "geojson-random";
import geojsonExtent from "geojson-extent";
import geojsonFlatten from "geojson-flatten";

import {Button, Menu, Icon } from 'antd';

const SubMenu = Menu.SubMenu;
const MenuItemGroup = Menu.ItemGroup;

const shpSupport = typeof ArrayBuffer !== "undefined";

const githubAPI = !!config.GithubAPI;
const githubBase = githubAPI
  ? config.GithubAPI + "/api/v3"
  : "https://api.github.com";

export default class FileBar extends React.Component {
  constructor(props) {
    super(props);
    this.fileInputRef = React.createRef();
  }
  blindImport = () => {
    this.fileInputRef.current.click();
  };
  onFileInputChange = e => {
    const { setGeojson } = this.props;
    const { files } = e.target;
    if (!(files && files[0])) return;
    readFile.readAsText(files[0], function(err, text) {
      const result = readFile.readFile(files[0], text);
      if (result instanceof Error) {
      } else {
        setGeojson(result);
      }
      if (files[0].path) {
        // context.data.set({
        //   path: files[0].path
        // });
      }
    });
  };
  downloadTopo = () => {
    const { geojson } = this.props;
    var content = JSON.stringify(
      topojson.topology(
        {
          collection: clone(geojson)
        },
        {
          "property-transform": function(properties, key, value) {
            properties[key] = value;
            return true;
          }
        }
      )
    );

    this.download(content, "map.topojson", "text/plain;charset=utf-8");
  };

  download = (content, filename, type) => {
    saveAs(
      new Blob([content], {
        type
      }),
      filename
    );
  };

  downloadGPX = () => {
    const { geojson } = this.props;
    this.download(
      togpx(geojson, {
        creator: "geojson.net"
      }),
      "map.gpx",
      "text/xml;charset=utf-8"
    );
  };

  downloadGeoJSON = () => {
    const { geojson } = this.props;
    this.download(
      JSON.stringify(geojson, null, 2),
      "map.geojson",
      "text/plain;charset=utf-8"
    );
  };

  downloadDSV = () => {
    const { geojson } = this.props;
    this.download(
      geojson2dsv(geojson),
      "points.csv",
      "text/plain;charset=utf-8"
    );
  };

  downloadKML = () => {
    const { geojson } = this.props;
    this.download(tokml(geojson), "map.kml", "text/plain;charset=utf-8");
  };

  downloadShp = () => {
    d3.select(".map").classed("loading", true);
    try {
      shpwrite.download(context.data.get("map"));
    } finally {
      d3.select(".map").classed("loading", false);
    }
  };

  downloadWKT = () => {
    var contentArray = [];
    var features = context.data.get("map").features;
    if (features.length === 0) return;
    var content = features.map(wellknown.stringify).join("\n");
    saveAs(
      new Blob([content], {
        type: "text/plain;charset=utf-8"
      }),
      "map.wkt"
    );
  };

  render() {
    const { setGeojson } = this.props;
    const exportFormats = [
      {
        title: "GeoJSON",
        action: this.downloadGeoJSON
      },
      {
        title: "TopoJSON",
        action: this.downloadTopo
      },
      {
        title: "GPX",
        action: this.downloadGPX
      },
      {
        title: "CSV",
        action: this.downloadDSV
      },
      {
        title: "KML",
        action: this.downloadKML
      },
      {
        title: "WKT",
        action: this.downloadWKT
      }
    ];
    var actions = [
      {
        title: "Save",
        action: githubAPI ? saveAction : function() {},
        children: exportFormats
      },
      {
        title: "New",
        action: function() {
          window.open(
            window.location.origin + window.location.pathname + "#new"
          );
        }
      },
      {
        title: "Meta",
        action: function() {},
        children: [
          {
            title: "Clear",
            alt: "Delete all features from the map",
            action: () => {
              if (
                confirm(
                  "Are you sure you want to delete all features from this map?"
                )
              ) {
                setGeojson({ type: "FeatureCollection", features: [] });
              }
            }
          },
          {
            title: "Random: Points",
            alt: "Add random points to your map",
            action: () => {
              const { setGeojson, geojson } = this.props;
              var response = prompt("Number of points (default: 100)");
              if (response === null) return;
              var count = parseInt(response, 10);
              if (isNaN(count)) count = 100;
              const fc = geojsonNormalize(geojson);
              fc.features.push.apply(
                fc.features,
                geojsonRandom(count, "point").features
              );
              setGeojson(fc);
            }
          },
          {
            title: "Add bboxes",
            alt: "Add bounding box members to all applicable GeoJSON objects",
            action: () => {
              const { setGeojson, geojson } = this.props;
              setGeojson(geojsonExtent.bboxify(geojson));
            }
          },
          {
            title: "Flatten Multi Features",
            alt:
              "Flatten MultiPolygons, MultiLines, and GeometryCollections into simple geometries",
            action: () => {
              const { setGeojson, geojson } = this.props;
              setGeojson(geojsonFlatten(geojson));
            }
          },
          // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
          {
            title: "Load encoded polyline",
            alt:
              "Decode and show an encoded polyline. Precision 5 is supported.",
            action: () => {
              const { setGeojson } = this.props;
              const input = prompt("Enter your polyline");
              try {
                const decoded = polyline.toGeoJSON(input);
                setGeojson(decoded);
              } catch (e) {
                alert("Sorry, we were unable to decode that polyline");
              }
            }
          },
          {
            title: "Load WKB Base64 Encoded String",
            alt: "Decode and show WKX data",
            action: () => {
              const input = prompt("Enter your Base64 encoded WKB/EWKB");
              try {
                // TODO: base64 in browser
                var decoded = wkx.Geometry.parse(Buffer.from(input, "base64"));
                setGeojson(decoded.toGeoJSON());
                // zoomextent(context); TODO
              } catch (e) {
                console.error(e);
                alert(
                  "Sorry, we were unable to decode that Base64 encoded WKX data"
                );
              }
            }
          },
          {
            title: "Load WKB Hex Encoded String",
            alt: "Decode and show WKX data",
            action: function() {
              const input = prompt("Enter your Hex encoded WKB/EWKB");
              try {
                var decoded = wkx.Geometry.parse(Buffer.from(input, "hex"));
                setGeojson(decoded.toGeoJSON());
                // zoomextent(context); TODO
              } catch (e) {
                console.error(e);
                alert(
                  "Sorry, we were unable to decode that Hex encoded WKX data"
                );
              }
            }
          },
          {
            title: "Load WKT String",
            alt: "Decode and show WKX data",
            action: function() {
              const input = prompt("Enter your WKT/EWKT String");
              try {
                var decoded = wkx.Geometry.parse(input);
                setGeojson(decoded.toGeoJSON());
                // zoomextent(context); TODO
              } catch (e) {
                console.error(e);
                alert("Sorry, we were unable to decode that WKT data");
              }
            }
          }
        ]
      }
    ];

    const importFormats = [
      {
        title: "GeoJSON",
        action: this.blindImport
      },
      {
        title: "TopoJSON",
        action: this.blindImport
      }
    ]

    actions.unshift({
      title: "Open",
      children: [
        {
          title: "File",
          alt: "GeoJSON, TopoJSON, GTFS, KML, CSV, GPX and OSM XML supported",
          action: this.blindImport
        },
        {
          title: "GitHub",
          alt: "GeoJSON files in GitHub Repositories",
          authenticated: true,
          action: this.props.toggleGithubModal
        },
        {
          title: "Gist",
          alt: "GeoJSON files in GitHub Gists",
          authenticated: true,
          action: () => {}
        }
      ]
    });

    actions.splice(3, 0, {
      title: "Share",
      action: function() {
        context.container.call(share(context));
      }
    });
    actions.unshift({
      title: "Open",
      alt: "CSV, GTFS, KML, GPX, and other filetypes",
      action: this.blindImport
    });

    return (
      <Menu mode="horizontal" className="mainMenu">
        <Menu.Item key="signin">
          <Button type="primary" icon="github">Login</Button>
        </Menu.Item>
  
        <SubMenu 
          title={<span>Load</span>}
          children={
            <Menu>
              {importFormats.map((item, i) => {
                return (<Menu.Item onClick={item.action} key={i}>{item.title}</Menu.Item>)
              })}
            </Menu>
          }
          key="load">
        </SubMenu>

        <SubMenu 
          title={<span>Save</span>}
          children={
            <Menu>
              {exportFormats.map((item, i) => {
                return (<Menu.Item onClick={item.action} key={i}>{item.title}</Menu.Item>)
              })}
            </Menu>
          }
          key="save">
        </SubMenu>
      </Menu>

    );
  }
}
// THIS IS REQUIRED FOR THE LOADING DATA TO WORK
//         <input
//           type="file"
//           className="dn"
//           ref={this.fileInputRef}
//           onChange={this.onFileInputChange}
//         />

if (githubAPI) {
  var filetype = name
    .append("a")
    .attr("target", "_blank")
    .attr("class", "icon-file-alt");

  var filename = name
    .append("span")
    .attr("class", "filename")
    .text("unsaved");
}

function clickGistSave() {
  context.data.set({ type: "gist" });
  saver(context);
}

function saveAction() {
  saver(context);
}

function sourceIcon(type) {
  if (type == "github") return "icon-github";
  else if (type == "gist") return "icon-github-alt";
  else return "icon-file-alt";
}

function saveNoun(_) {
  buttons
    .filter(function(b) {
      return b.title === "Save";
    })
    .select("span.title")
    .text(_);
}

function onchange(d) {
  var data = d.obj,
    type = data.type,
    path = data.path;
  if (githubAPI)
    filename
      .text(path ? path : "unsaved")
      .classed("deemphasize", context.data.dirty);
  if (githubAPI)
    filetype.attr("href", data.url).attr("class", sourceIcon(type));
  saveNoun(type == "github" ? "Commit" : "Save");
}

function onImport(err, gj, warning) {
  if (err) {
    if (err.message) {
      flash(context.container, err.message).classed("error", "true");
    }
    return;
  }
  gj = geojsonNormalize(gj);
  if (gj) {
    context.data.mergeFeatures(gj.features);
    if (warning) {
      flash(context.container, warning.message);
    } else {
      flash(
        context.container,
        "Imported " + gj.features.length + " features."
      ).classed("success", "true");
    }
    zoomextent(context);
  }
}
