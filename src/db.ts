/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatLead, Operator, MarketingCampaign, FleetData, MonthlyGoal, JobVacancy, WorkScheduleSettings } from './types';

const DB_NAME = 'TransmontesRecruitmentDB';
const DB_VERSION = 1;

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains('leads')) {
        db.createObjectStore('leads', { keyPath: 'phone' });
      }
      if (!db.objectStoreNames.contains('operators')) {
        db.createObjectStore('operators', { keyPath: 'empNo' });
      }
      if (!db.objectStoreNames.contains('campaigns')) {
        db.createObjectStore('campaigns', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('fleet')) {
        db.createObjectStore('fleet', { keyPath: 'company' });
      }
      if (!db.objectStoreNames.contains('goals')) {
        db.createObjectStore('goals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('vacancies')) {
        db.createObjectStore('vacancies', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
  });
}

export function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) => {
    return new Promise<T[]>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveToStoreBulk<T>(storeName: string, items: T[]): Promise<void> {
  return openDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      items.forEach((item) => {
        store.put(item);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export function clearStore(storeName: string): Promise<void> {
  return openDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

export function saveSingleToStore<T>(storeName: string, item: T): Promise<void> {
  return openDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.put(item);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export function getSettings(): Promise<WorkScheduleSettings> {
  return openDB().then((db) => {
    return new Promise<WorkScheduleSettings>((resolve) => {
      const transaction = db.transaction('settings', 'readonly');
      const store = transaction.objectStore('settings');
      const request = store.get('work_schedule');

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.value);
        } else {
          // Default settings
          resolve({
            workDays: [1, 2, 3, 4, 5], // L-V
            startTime: '07:45',
            endTime: '17:10',
            timezone: 'America/Mexico_City',
          });
        }
      };
      request.onerror = () => {
        resolve({
          workDays: [1, 2, 3, 4, 5],
          startTime: '07:45',
          endTime: '17:10',
          timezone: 'America/Mexico_City',
        });
      };
    });
  });
}

export function saveSettings(settings: WorkScheduleSettings): Promise<void> {
  return saveSingleToStore('settings', { key: 'work_schedule', value: settings });
}
