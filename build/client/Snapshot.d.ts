import { IEntity } from '../common/IEntity';
type Snapshot = {
    messages: any[];
    createEntities: IEntity[];
    updateEntities: any[];
    deleteEntities: number[];
};
export { Snapshot };
