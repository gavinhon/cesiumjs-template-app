import type * as Cesium from 'cesium';

export interface GeographicBoundingBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface ServiceLayerOption {
  name: string;
  title: string;
  boundingBox?: GeographicBoundingBox;
}

export type MapServiceType = 'wms' | 'wmts' | 'xyz' | 'wfs' | 'arcgis-map' | 'arcgis-feature';

interface BaseConfig {
  id: string;
  name: string;
  url: string;
}

export interface WmsLayerConfig extends BaseConfig {
  type: 'wms';
  layers: string;
  boundingBox?: GeographicBoundingBox;
}

export interface WmtsLayerConfig extends BaseConfig {
  type: 'wmts';
  layer: string;
  style: string;
  format: string;
  tileMatrixSetID: string;
}

export interface XyzLayerConfig extends BaseConfig {
  type: 'xyz';
  maximumLevel?: number;
}

export type WfsVersion = '1.1.0' | '2.0.0';

export interface WfsLayerConfig extends BaseConfig {
  type: 'wfs';
  typeName: string;
  version: WfsVersion;
  maxFeatures: number;
  boundingBox?: GeographicBoundingBox;
}

export interface GeoJsonFileConfig extends BaseConfig {
  type: 'geojson';
}

export interface ArcGisMapServerConfig extends BaseConfig {
  type: 'arcgis-map';
  token?: string;
}

export interface ArcGisFeatureLayerConfig extends BaseConfig {
  type: 'arcgis-feature';
  maxFeatures: number;
  token?: string;
}

export type ImageryServiceConfig =
  WmsLayerConfig | WmtsLayerConfig | XyzLayerConfig | ArcGisMapServerConfig;

export type VectorServiceConfig = WfsLayerConfig | GeoJsonFileConfig | ArcGisFeatureLayerConfig;

export type MapServiceConfig = ImageryServiceConfig | VectorServiceConfig;

export interface ManagedImageryLayer {
  id: string;
  name: string;
  kind: string;
  cesiumLayer: Cesium.ImageryLayer;
  config: ImageryServiceConfig | null;
  visible: boolean;
  alpha: number;
  removable: boolean;
}

export interface ManagedVectorLayer {
  id: string;
  name: string;
  kind: string;
  dataSource: Cesium.GeoJsonDataSource;
  visible: boolean;
}
