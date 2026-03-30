const models = new Map<string, any>();

export const ModelRegistry = {
    register(name: string, model: any) {
        models.set(name, model);
    },

    get(name: string) {
        const model = models.get(name);
        if (!model) {
            throw new Error(`Oerem Registry Error: Model [${name}] is not registered.`);
        }
        return model;
    },

    all() {
        return models;
    }
};