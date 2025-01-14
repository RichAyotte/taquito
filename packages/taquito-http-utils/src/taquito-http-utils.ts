/**
 * @packageDocumentation
 * @module @taquito/http-utils
 */

import fetchAdapter from './fetch-adapter';
import { STATUS_CODE } from './status_code';
import axios from 'axios';
import { HttpRequestFailed, HttpResponseError } from './errors';

const isNode = typeof process !== 'undefined' && !!process?.versions?.node;

const adapter = isNode ? undefined : fetchAdapter;

export * from './status_code';
export { VERSION } from './version';
export { HttpRequestFailed, HttpResponseError } from './errors';

enum ResponseType {
  TEXT = 'text',
  JSON = 'json',
}

type ObjectType = Record<string, any>;

export interface HttpRequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  timeout?: number;
  json?: boolean;
  query?: ObjectType;
  headers?: { [key: string]: string };
  mimeType?: string;
}

export class HttpBackend {
  constructor(private timeout: number = 30000) {}

  protected serialize(obj?: ObjectType) {
    if (!obj) {
      return '';
    }

    const str = [];
    for (const p in obj) {
      // eslint-disable-next-line no-prototype-builtins
      if (obj.hasOwnProperty(p) && typeof obj[p] !== 'undefined') {
        const prop = typeof obj[p].toJSON === 'function' ? obj[p].toJSON() : obj[p];
        // query arguments can have no value so we need some way of handling that
        // example https://domain.com/query?all
        if (prop === null) {
          str.push(encodeURIComponent(p));
          continue;
        }
        // another use case is multiple arguments with the same name
        // they are passed as array
        if (Array.isArray(prop)) {
          prop.forEach((item) => {
            str.push(encodeURIComponent(p) + '=' + encodeURIComponent(item));
          });
          continue;
        }
        str.push(encodeURIComponent(p) + '=' + encodeURIComponent(prop));
      }
    }
    const serialized = str.join('&');
    if (serialized) {
      return `?${serialized}`;
    } else {
      return '';
    }
  }

  /**
   *
   * @param options contains options to be passed for the HTTP request (url, method and timeout)
   * @throws {@link HttpRequestFailed} | {@link HttpResponseError}
   */
  async createRequest<T>(
    { url, method, timeout = this.timeout, query, headers = {}, json = true }: HttpRequestOptions,
    data?: object | string
  ) {
    const urlWithQuery = url + this.serialize(query);
    let resType: ResponseType;
    let transformResponse = undefined;

    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (!json) {
      resType = ResponseType.TEXT;
      transformResponse = [<Type>(v: Type) => v];
    } else {
      resType = ResponseType.JSON;
    }

    try {
      const response = await axios.request<T>({
        url: urlWithQuery,
        method: method ?? 'GET',
        headers: headers,
        responseType: resType,
        transformResponse,
        timeout: timeout,
        data: data,
        adapter,
      });

      return response.data;
    } catch (err: any) {
      if ((axios.isAxiosError(err) && err.response) || (!isNode && err.response)) {
        let errorData;

        if (typeof err.response.data === 'object') {
          errorData = JSON.stringify(err.response.data);
        } else {
          errorData = err.response.data;
        }

        throw new HttpResponseError(
          `Http error response: (${err.response.status}) ${errorData}`,
          err.response.status as STATUS_CODE,
          err.response.statusText,
          errorData,
          urlWithQuery
        );
      } else {
        throw new HttpRequestFailed(String(method), urlWithQuery, err);
      }
    }
  }
}
