import { Project, TypeFormatFlags } from "ts-morph";
import * as path from "path";

const project = new Project();
const knexDts = project.addSourceFileAtPath(
    path.join(process.cwd(), "node_modules/knex/types/index.d.ts")
);

// Sekarang kita gunakan daftar terlarang
const forbiddenMethods = new Set([
    'update', 'insert', 'del', 'delete', 'increment', 'decrement',
    'truncate', 'then', 'catch', 'finally', 'asCallback', 'clone', 'transacting'
]);

function simplifyType(typeStr: string): string {
    // Implementasi sesuai gaya manualmu
    if (typeStr.includes('QueryCallback')) return 'QueryCallback';
    if (typeStr.includes('ComparisonOperator')) return 'ComparisonOperator';
    if (typeStr.includes('keyof TRecord') || typeStr.includes('K')) return 'keyof T';
    if (typeStr.includes('readonly K[]')) return 'keyof T[]';
    if (typeStr.includes('AliasUT')) return 'string | Record<string, string>';

    // Sederhanakan tipe kompleks menjadi any/string/Function
    const complexPatterns = [
        'TableDescriptor', 'ColumnDescriptor', 'Raw', 'QueryBuilder',
        'Value', 'TInner', 'TResult', 'ResolveTableType', 'Readonly', 'JoinCallback'
    ];

    if (complexPatterns.some(p => typeStr.includes(p))) {
        if (typeStr.includes('[]')) return 'any[]';
        if (typeStr.includes('Function') || typeStr.includes('=>')) return 'Function';
        return 'any';
    }

    return typeStr.replace(/Knex\./g, '');
}

async function generate() {
    const outSource = project.createSourceFile("src/oerem-query.ts", "", { overwrite: true });

    outSource.insertText(0, `import { QueryBuilder } from "knex";

type ComparisonOperator = '=' | '>' | '>=' | '<' | '<=' | '<>';
type QueryCallback = (this: QueryBuilder, builder: QueryBuilder) => void;

`);

    const oeremInterface = outSource.addInterface({
        name: "OeremQuery",
        typeParameters: ["T"],
        isExported: true
    });

    const knexNamespace = knexDts.getModule("Knex");
    const queryInterface = knexNamespace?.getInterface("QueryInterface");

    if (!queryInterface) return;

    queryInterface.getProperties().forEach(prop => {
        const name = prop.getName();

        // Filter: Hanya ambil yang tidak dilarang dan tidak diawali underscore
        if (!forbiddenMethods.has(name) && !name.startsWith('_')) {
            const propType = prop.getType();
            const callSignatures = propType.getCallSignatures();

            callSignatures.forEach(sig => {
                const parameters = sig.getParameters().map(p => {
                    const decl = p.getDeclarations()[0];
                    let rawType = p.getTypeAtLocation(decl).getText(decl, TypeFormatFlags.NoTruncation);

                    return {
                        name: p.getName(),
                        type: simplifyType(rawType),
                        isOptional: p.isOptional()
                    };
                });

                oeremInterface.addMethod({
                    name: name,
                    parameters: parameters,
                    returnType: "OeremQuery<T>"
                });
            });
        }
    });

    outSource.formatText();
    await outSource.save();
    console.log("✅ OeremQuery generated based on your manual style.");
}

generate();