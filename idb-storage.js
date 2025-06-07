//两种访问数据库的模式：自动管理版本和手动管理版本
//在已存在的 db 中创建新的 store 会导致自动升级数据库版本
//若要避免这一点，请 checkVersion
//最佳实践：不要用不同的方式访问同一个数据库
Promise.fromIDBRequest ||= req =>
	new Promise((resolve, reject)=>{
		req.onsuccess = ()=>resolve(req.result)
		req.onerror = ()=>reject(req.error)
		req.$reject = reject
	})

const dbPromises = Object.create(null)
async function openDB(name, option={}){
	let {version, stores} = option
	if(!dbPromises[name]){
		let req = indexedDB.open(name, version)
		req.onupgradeneeded = () => stores && ungrade(req.result, stores)
		dbPromises[name] = Promise.fromIDBRequest(req)
		req.onblocked = req.$reject //若之前的数据库也通过 openDB 打开，则理论上不会阻塞
		dbPromises[name].catch(err=>{
			delete dbPromises[name]
		})
	}
	let db = await dbPromises[name]
	if(version){
		if(db.version > version) //复用之前打开的 db 时可能发生
			throw new DOMException(`The requested version (${version}) is less than the existing version (${db.version}).`, 'VersionError')
		if(db.version < version){
			delete dbPromises[name]
			return openDB(name, option)
		}
	}
	if(stores && needUpgrade(db, stores)){
		if(db.version == version)
			throw new DOMException('指定的版本与 stores 不匹配')
		//未指定版本，自动升级
		delete dbPromises[name]
		return openDB(name, {
			version: db.version+1,
			stores
		})
	}
	db.onversionchange = ()=>{
		db.close()
		delete dbPromises[name]
	}
	return db
}
function ungrade(db, stores){
	//只能在 upgradeneeded 事件使用
	//创建缺少的store（多余的会忽略）
	for(let name of stores)
		if(!db.objectStoreNames.contains(name))
			db.createObjectStore(name)
}
function needUpgrade(db, stores){
	for(let name of stores)
		if(!db.objectStoreNames.contains(name))
			return true
}

class IDBStorage{
	static checkVersion(dbName, version, storeNames){
		//异步函数
		//若版本吻合，但 storeNames 不匹配则抛出错误
		//若当前版本低于期望的版本，则根据 storeNames 创建缺少的store（多余的会忽略）
		//若当前版本高于期望的版本，则抛出错误
		//成功则返回 db（不建议长期保留该引用）
		return openDB(dbName, {
			version,
			stores: storeNames
		})
	}
	constructor(dbName, storeName){
		//构造前建议先 checkVersion
		this.db = dbName
		this.store = storeName
		openDB(this.db, {stores:[this.store]})
	}
	async getStore(mode){
		let db = await openDB(this.db, {stores:[this.store]})
		return db.transaction(this.store, mode).objectStore(this.store)
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
		let store = await this.getStore('readonly')
		let promises = keys.map(key=>Promise.fromIDBRequest(store.delete(key)))
		return Promise.all(promises)
	}
}

export default IDBStorage
