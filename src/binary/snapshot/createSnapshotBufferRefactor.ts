import { Instance } from '../../server/Instance'
import { User } from '../../server/User'
import { collectSnapshotPlan } from './collectSnapshotPlan'
import { commitSnapshotPlan } from './commitSnapshotPlan'
import { countSnapshotBytes } from './countSnapshotBytes'
import { writeSnapshot } from './writeSnapshot'

const createSnapshotBufferRefactor = (user: User, instance: Instance) => {
    instance.network.queueProtocolIfChanged(user)
    const plan = collectSnapshotPlan(user, instance)
    const queuedResponses = user.responseQueue.length
    const protocol = instance.network.getProtocol()
    const bytes = countSnapshotBytes(plan, instance.context, protocol)
    const writer = user.networkAdapter.binary.createWriter(bytes)

    writeSnapshot(plan, instance.context, writer, protocol)
    commitSnapshotPlan(user, plan)
    instance.network.reportResponseBacklog(user, queuedResponses, plan.responses.length)

    return writer.payload
}

export default createSnapshotBufferRefactor
export { collectSnapshotPlan, collectSnapshotPlan as getVisibleState }
export { commitSnapshotPlan, countSnapshotBytes, writeSnapshot }
export type { SnapshotPlan, SnapshotResponse } from './SnapshotPlan'
