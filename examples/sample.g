# Sample GAP source for checking syntax highlighting and hovers.
G := SymmetricGroup(4);
gens := GeneratorsOfGroup(G);

if IsGroup(G) and Size(G) = 24 then
    Print("S4 has ", Length(gens), " generators in this presentation\n");
fi;

f := function(n)
    local values;
    values := List([1 .. n], i -> Factorial(i));
    return values;
end;
