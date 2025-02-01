Promise.fromIDBRequest ||= req =>
	new Promise((resolve, reject)=>{
		req.onsuccess = ()=>resolve(req.result)
		req.onerror = ()=>reject(req.error)
	})

class IDBStorage{
	static checkVersion(dbName, version, storeNames){
		//返回Promise
		//若版本吻合，则不检查 storeNames
		//若当前版本低于期望的版本，则根据 storeNames 创建缺少的store（多余的会忽略）
		//若当前版本高于期望的版本，则抛出错误
		let req = indexedDB.open(dbName, version)
		req.onupgradeneeded = ()=>{
			let db = req.result
			for(let name of storeNames)
				if(!db.objectStoreNames.contains(name))
					db.createObjectStore(name)
		}
		return Promise.fromIDBRequest(req)
	}
	constructor(dbName, storeName){
		//无法在已有的 database 中创建新的 store。若有需求，请 checkVersion
		this.storeName = storeName
		let req = indexedDB.open(dbName)
		this.dbPromise = Promise.fromIDBRequest(req)
	}
	async getStore(mode){
		let db = await this.dbPromise
		return db.transaction(this.storeName, mode).objectStore(this.storeName)
	}
	async get(key){
		let store = await this.getStore('readonly')
		return Promise.fromIDBRequest(store.get(key))
	}
	async getMany(keys){
		let store = await this.getStore('readonly')
		let promises = keys.map(key=>Promise.fromIDBRequest(store.get(key)))
		return Promise.all(promises)
	}
	async set(key, val){
		let store = await this.getStore('readwrite')
		return Promise.fromIDBRequest(store.put(val, key))
	}
	async setMany(entries){
		let store = await this.getStore('readwrite')
		let promises = entries.map(entry=>Promise.fromIDBRequest(store.put(entry[1], entry[0])))
		return Promise.all(promises)
	}
	async entries(){
		let store = await this.getStore('readonly')
		let [keys, values] = await Promise.all([
			Promise.fromIDBRequest(store.getAllKeys()),
			Promise.fromIDBRequest(store.getAll())
		])
		return keys.map((key, i)=>[key, values[i]])
	}
	async update(key, updater){
		let store = await this.getStore('readwrite')
		let val = await Promise.fromIDBRequest(store.get(key))
		return Promise.fromIDBRequest(store.put(updater(val), key))
	}
	async del(key){
		let store = await this.getStore('readwrite')
		return Promise.fromIDBRequest(store.delete(key))
	}
	async delMany(keys){
		throw 'todo: delMany'
	}
}

export default IDBStorage