import ts from "typescript";

export function rewriteEnumMembers(
    source: ts.SourceFile,
    mapping: Readonly<Record<string, string>>,
): { source: ts.SourceFile; changed: boolean } {
    let fileChanged = false;

    const newStatements = source.statements.map((stmt) => {
        if (!ts.isEnumDeclaration(stmt)) return stmt;

        let enumChanged = false;
        const newMembers = stmt.members.map((member) => {
            const memberName = readEnumMemberName(member);
            if (memberName === null) return member;

            const wireValue = mapping[memberName];
            if (wireValue === undefined) return member;

            enumChanged = true;
            return ts.factory.updateEnumMember(
                member,
                member.name,
                ts.factory.createStringLiteral(wireValue),
            );
        });

        if (!enumChanged) return stmt;
        fileChanged = true;

        return ts.factory.updateEnumDeclaration(
            stmt,
            stmt.modifiers,
            stmt.name,
            newMembers,
        );
    });

    if (!fileChanged) return { source, changed: false };

    return {
        source: ts.factory.updateSourceFile(source, newStatements),
        changed: true,
    };
}

function readEnumMemberName(member: ts.EnumMember): string | null {
    if (ts.isIdentifier(member.name)) return ts.idText(member.name);
    if (ts.isStringLiteral(member.name)) return member.name.text;
    return null;
}
