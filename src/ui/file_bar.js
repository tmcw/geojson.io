import React from "react";
import L from "leaflet";
import shpwrite from "shp-write";
import wkx from "wkx";
import geojson2dsv from "geojson2dsv";
import togpx from "togpx";
import polyline from "@mapbox/polyline";
import topojson from "topojson";
import { saveAs } from "file-saver";
import tokml from "tokml";
import geojsonNormalize from "@mapbox/geojson-normalize";
import simplify from "@turf/simplify";
import wellknown from "wellknown";
import magicFile from "../lib/magic_file";
import geojsonRandom from "geojson-random";
import geojsonExtent from "geojson-extent";
import geojsonFlatten from "geojson-flatten";
import mergeGeojson from "../lib/merge_geojson";

export default class FileBar extends React.Component {
  constructor(props) {
    super(props);
    this.fileInputRef = React.createRef();
  }
  blindImport = () => {
    this.fileInputRef.current.click();
  };
  onFileInputChange = async e => {
    const { files } = e.target;
    const { geojson, setGeojson } = this.props;
    const geojsons = await Promise.all([...files].map(file => {
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.addEventListener("load", () =>
          resolve(magicFile(reader.result))
        );
      });
    }));
    setGeojson(mergeGeojson([geojson, ...geojsons]));
  };
  downloadTopo = () => {
    const { geojson } = this.props;
    var content = JSON.stringify(
      topojson.topology(
        {
          collection: JSON.parse(JSON.stringify(geojson))
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
    const { geojson } = this.props;
    shpwrite.download(geojson);
  };

  downloadWKT = () => {
    const { geojson } = this.props;
    var features = geojson.features;
    if (features.length === 0) return;
    var content = features.map(wellknown.stringify).join("\n");
    this.download(content, "map.wkt", "text/plain;charset=utf-8");
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
        title: "Shapefile",
        action: this.downloadShp
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
              setGeojson({
                type: "FeatureCollection",
                features: fc.features.concat(
                  geojsonRandom.point(count).features
                )
              });
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
            title: "Simplify",
            alt: "Remove unnecessary detail from GeoJSON features",
            action: () => {
              const { setGeojson, geojson } = this.props;
              setGeojson(simplify(geojson));
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

    actions.unshift({
      title: "Open",
      children: [
        {
          title: "File",
          alt: "GeoJSON, TopoJSON, GTFS, KML, CSV, GPX and OSM XML supported",
          action: this.blindImport
        },
        ,
        /*{
          title: "Gist",
          alt: "GeoJSON files in GitHub Gists",
          authenticated: true,
          action: this.props.toggleGistModal
        }*/
        {
          title: "GitHub",
          alt: "GeoJSON files in GitHub Repositories",
          authenticated: true,
          action: this.props.toggleGithubModal
        }
      ]
    });

    return (
      <div className="inline-flex">
        {actions.map((item, i) => {
          return (
            <div
              key={i}
              style={{ zIndex: 999 }}
              onClick={item.action}
              className="db bn pa2 outline-0 disappear-child relative pointer black hover-bg-yellow "
            >
              {item.title}
              {item.children ? (
                <div
                  className="child bg-white absolute w4 bt pv2"
                  style={{
                    top: 32,
                    left: 0
                  }}
                >
                  {item.children.map((child, i) => {
                    return (
                      <div
                        onClick={child.action}
                        key={i}
                        className={`bn pv1 ph2 outline-0 tl db hover-bg-yellow w-100 pointer`}
                      >
                        {child.title}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
        <input
          type="file"
          className="dn"
          multiple
          ref={this.fileInputRef}
          onChange={this.onFileInputChange}
        />
      </div>
    );
  }
}
