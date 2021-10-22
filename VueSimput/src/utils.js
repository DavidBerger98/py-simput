export const MANAGERS = {};

export class DataManager {
  constructor(namespace, wsClient) {
    this.namespace = namespace;
    this.cache = null;
    this.comm = [];
    this.pending = {};
    this.wsClient = wsClient;
    this.resetCache();
    this.nextTS = 1;
    this.subscription = this.wsClient
      .getConnection()
      .getSession()
      .subscribe('simput.push', ([event]) => {
        const {
          id, data, domains, type, ui,
        } = event;
        if (data) {
          console.log(`data(${id})`);
          delete this.pending[id];
          const before = JSON.stringify(this.cache.data[id]?.properties);
          const after = JSON.stringify(data.properties);
          if (before !== after) {
            this.cache.data[id] = data;
          }
          this.cache.data[id].mtime = data.mtime;
          this.cache.data[id].original = JSON.parse(after);
        }
        if (domains) {
          console.log(`domains(${id})`);
          const before = JSON.stringify(this.cache.domains[id]);
          const after = JSON.stringify(domains);
          // console.log(JSON.stringify(domains, null, 2));
          if (before !== after) {
            this.cache.domains[id] = domains;
          }
        }
        if (ui) {
          console.log(`ui(${type})`);
          delete this.pending[type];
          this.cache.ui[type] = ui;
        }

        this.notify('change', { id, type });
        if (ui) {
          this.nextTS += 1;
          this.notify('templateTS');
        }
      });
    this.subscriptionUI = this.wsClient
      .getConnection()
      .getSession()
      .subscribe('simput.event', ([event]) => {
        if (event.topic === 'ui-change') {
          const typesToFetch = Object.keys(this.cache.ui);
          this.cache.ui = {};
          for (let i = 0; i < typesToFetch.length; i++) {
            this.getUI(typesToFetch[i]);
          }
        }
        if (event.topic === 'data-change') {
          const { ids, action } = event;
          for (let i = 0; i < ids.length; i++) {
            if (this.cache.data[ids[i]]) {
              if (action === 'change') {
                console.log('getData from data-change', ids[i]);
                this.getData(ids[i], true);
              }
            }
          }
        }
      });

    this.onDirty = ({ id, name }) => {
      const value = this.cache.data[id].properties[name];
      console.log(' > dirty', id, name);
      this.wsClient
        .getRemote()
        .PyWebVue.trigger(`${this.namespace}Update`, [[{ id, name, value }]]);
    };
  }

  resetCache() {
    this.cache = {
      data: {},
      ui: {},
      domains: {},
    };
  }

  connectBus(bus) {
    if (this.comm.indexOf(bus) === -1) {
      this.comm.push(bus);
      bus.$emit('connect');
      bus.$on('dirty', this.onDirty);
    }
  }

  disconnectBus(bus) {
    const index = this.comm.indexOf(bus);
    if (index > -1) {
      bus.$emit('disconnect');
      bus.$off('dirty', this.onDirty);
      this.comm.splice(index, 1);
    }
  }

  notify(topic, event) {
    for (let i = 0; i < this.comm.length; i++) {
      this.comm[i].$emit(topic, event);
    }
  }

  getData(id, forceFetch = false) {
    const data = this.cache.data[id];

    if ((!data || forceFetch) && !this.pending[id]) {
      console.log(' > fetch data', id, forceFetch);
      this.pending[id] = true;
      this.wsClient.getRemote().PyWebVue.trigger(`${this.namespace}Fetch`, [], { id });
    }

    return data;
  }

  getDomains(id, forceFetch = false) {
    const domains = this.cache.domains[id];

    if ((!domains || forceFetch) && !this.pending[id]) {
      console.log(' > fetch domain', id, forceFetch);
      this.pending[id] = true;
      this.wsClient.getRemote().PyWebVue.trigger(`${this.namespace}Fetch`, [], { domains: id });
    }

    return domains;
  }

  getUI(type, forceFetch = false) {
    const ui = this.cache.ui[type];

    if ((!ui || forceFetch) && !this.pending[type]) {
      console.log(' > fetch ui', type, forceFetch);
      this.pending[type] = true;
      this.wsClient.getRemote().PyWebVue.trigger(`${this.namespace}Fetch`, [], { type });
    }

    return ui;
  }

  getUITimeStamp() {
    return this.nextTS;
  }

  refresh(id, name) {
    console.log(' > refresh', id, name);
    this.wsClient.getRemote().PyWebVue.trigger(`${this.namespace}Refresh`, [id, name]);
  }
}

export function getSimputManager(id, namespace, client) {
  if (!client) {
    return null;
  }

  if (MANAGERS[id]) {
    return MANAGERS[id];
  }

  const manager = new DataManager(namespace, client);
  MANAGERS[id] = manager;
  return manager;
}
