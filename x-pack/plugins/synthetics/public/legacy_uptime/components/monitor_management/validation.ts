/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { isValidNamespace } from '@kbn/fleet-plugin/common';
import {
  ConfigKey,
  DataStream,
  ScheduleUnit,
  MonitorFields,
  isServiceLocationInvalid,
} from '../../../../common/runtime_types';
import { Validation } from '../../../../common/types';

export const digitsOnly = /^[0-9]*$/g;
export const includesValidPort = /[^\:]+:[0-9]{1,5}$/g;

// returns true if invalid
function validateHeaders<T>(headers: T): boolean {
  return Object.keys(headers).some((key) => {
    if (key) {
      const whiteSpaceRegEx = /[\s]/g;
      return whiteSpaceRegEx.test(key);
    } else {
      return false;
    }
  });
}

export const validateParamsValue = (params?: string) => {
  try {
    if (params) {
      JSON.parse(params ?? '');
    }
  } catch (e) {
    return true;
  }
  return false;
};

// returns true if invalid
const validateTimeout = ({
  scheduleNumber,
  scheduleUnit,
  timeout,
}: {
  scheduleNumber: string;
  scheduleUnit: ScheduleUnit;
  timeout: string;
}): boolean => {
  let schedule: number;
  switch (scheduleUnit) {
    case ScheduleUnit.SECONDS:
      schedule = parseFloat(scheduleNumber);
      break;
    case ScheduleUnit.MINUTES:
      schedule = parseFloat(scheduleNumber) * 60;
      break;
    default:
      schedule = parseFloat(scheduleNumber);
  }

  return parseFloat(timeout) > schedule;
};

// validation functions return true when invalid
export const validateCommon: Validation = {
  [ConfigKey.NAME]: ({ [ConfigKey.NAME]: value }) => {
    return !value || typeof value !== 'string';
  },
  [ConfigKey.SCHEDULE]: ({ [ConfigKey.SCHEDULE]: value }) => {
    const { number, unit } = value as MonitorFields[ConfigKey.SCHEDULE];
    const parsedFloat = parseFloat(number);
    return !parsedFloat || !unit || parsedFloat < 1;
  },
  [ConfigKey.TIMEOUT]: ({
    [ConfigKey.MONITOR_TYPE]: monitorType,
    [ConfigKey.TIMEOUT]: timeout,
    [ConfigKey.SCHEDULE]: schedule,
  }) => {
    const { number, unit } = schedule as MonitorFields[ConfigKey.SCHEDULE];

    // Timeout is not currently supported by browser monitors
    if (monitorType === DataStream.BROWSER) {
      return false;
    }

    return (
      !timeout ||
      parseFloat(timeout) < 0 ||
      validateTimeout({
        timeout,
        scheduleNumber: number,
        scheduleUnit: unit,
      })
    );
  },
  [ConfigKey.LOCATIONS]: ({ [ConfigKey.LOCATIONS]: locations }) => {
    return (
      !Array.isArray(locations) || locations.length < 1 || locations.some(isServiceLocationInvalid)
    );
  },
  [ConfigKey.NAMESPACE]: ({ [ConfigKey.NAMESPACE]: value }) => {
    const { error = '', valid } = isValidNamespace(value ?? '');
    return valid ? false : error;
  },
};

const validateHTTP: Validation = {
  [ConfigKey.RESPONSE_STATUS_CHECK]: ({ [ConfigKey.RESPONSE_STATUS_CHECK]: value }) => {
    const statusCodes = value as MonitorFields[ConfigKey.RESPONSE_STATUS_CHECK];
    return statusCodes.length ? statusCodes.some((code) => !`${code}`.match(digitsOnly)) : false;
  },
  [ConfigKey.RESPONSE_HEADERS_CHECK]: ({ [ConfigKey.RESPONSE_HEADERS_CHECK]: value }) => {
    const headers = value as MonitorFields[ConfigKey.RESPONSE_HEADERS_CHECK];
    return validateHeaders<MonitorFields[ConfigKey.RESPONSE_HEADERS_CHECK]>(headers);
  },
  [ConfigKey.REQUEST_HEADERS_CHECK]: ({ [ConfigKey.REQUEST_HEADERS_CHECK]: value }) => {
    const headers = value as MonitorFields[ConfigKey.REQUEST_HEADERS_CHECK];
    return validateHeaders<MonitorFields[ConfigKey.REQUEST_HEADERS_CHECK]>(headers);
  },
  [ConfigKey.MAX_REDIRECTS]: ({ [ConfigKey.MAX_REDIRECTS]: value }) =>
    (!!value && !`${value}`.match(digitsOnly)) ||
    parseFloat(value as MonitorFields[ConfigKey.MAX_REDIRECTS]) < 0,
  [ConfigKey.URLS]: ({ [ConfigKey.URLS]: value }) => !value,
  ...validateCommon,
};

const validateTCP: Validation = {
  [ConfigKey.HOSTS]: ({ [ConfigKey.HOSTS]: value }) => {
    return !value || !`${value}`.match(includesValidPort);
  },
  ...validateCommon,
};

const validateICMP: Validation = {
  [ConfigKey.HOSTS]: ({ [ConfigKey.HOSTS]: value }) => !value,
  [ConfigKey.WAIT]: ({ [ConfigKey.WAIT]: value }) =>
    !!value &&
    !digitsOnly.test(`${value}`) &&
    parseFloat(value as MonitorFields[ConfigKey.WAIT]) < 0,
  ...validateCommon,
};

const validateThrottleValue = (speed: string | undefined, allowZero?: boolean) => {
  if (speed === undefined || speed === '') return false;
  const throttleValue = parseFloat(speed);
  return isNaN(throttleValue) || (allowZero ? throttleValue < 0 : throttleValue <= 0);
};

const validateBrowser: Validation = {
  ...validateCommon,
  [ConfigKey.SOURCE_INLINE]: ({ [ConfigKey.SOURCE_INLINE]: inlineScript }) => !inlineScript,
  [ConfigKey.DOWNLOAD_SPEED]: ({ [ConfigKey.DOWNLOAD_SPEED]: downloadSpeed }) =>
    validateThrottleValue(downloadSpeed),
  [ConfigKey.UPLOAD_SPEED]: ({ [ConfigKey.UPLOAD_SPEED]: uploadSpeed }) =>
    validateThrottleValue(uploadSpeed),
  [ConfigKey.LATENCY]: ({ [ConfigKey.LATENCY]: latency }) => validateThrottleValue(latency, true),
  [ConfigKey.PARAMS]: ({ [ConfigKey.PARAMS]: params }) => validateParamsValue(params),
};

export type ValidateDictionary = Record<DataStream, Validation>;

export const validate: ValidateDictionary = {
  [DataStream.HTTP]: validateHTTP,
  [DataStream.TCP]: validateTCP,
  [DataStream.ICMP]: validateICMP,
  [DataStream.BROWSER]: validateBrowser,
};
