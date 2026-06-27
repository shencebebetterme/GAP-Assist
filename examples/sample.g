# Containers and record fields.
G := SymmetricGroup(4);
gens := GeneratorsOfGroup(G);
elems := Elements(G);

firstGen := gens[1];

person := rec(
    name := "Ada",
    age := 42,
    address := rec(city := "Paris")
);

personName := person.name;
personCity := person.address.city;
missingField := person.missing;  # diagnostic: unknown field on record literal

# Operator diagnostics.
n := 5;
m := n + 10;        # hover m: integer
badAdd := "hi" + 2; # diagnostic
badNot := not n;    # diagnostic
badIn := 1 in n;    # diagnostic
badPower := 2 ^ 3 ^ 4; # diagnostic: GAP ^ is not associative

# Function parameter and return inference.
usesGens := function(obj)
    return GeneratorsOfGroup(obj);
end;

okGens := usesGens(SymmetricGroup(4));
badGens := usesGens(5); # diagnostic: argument incompatible

makeValues := function(n)
    local values;
    values := List([1 .. n], i -> Factorial(i));
    return values;
end;

values := makeValues(5); # hover values: list[positive integer]

# Callback checks.
selected := Filtered(gens, g -> IsObject(g)); # preserves element type
badForAll := ForAll([1 .. 4], i -> i + 1);    # diagnostic: predicate returns integer

# Flow-sensitive guards.
afterGuard := function(obj)
    if not IsString(obj) then
        return fail;
    fi;
    return obj[1]; # hover obj: string; return inferred as character/fail mix
end;

branchFlow := function(obj)
    if IsString(obj) then
        return Length(obj);
    elif IsGroup(obj) then
        return Size(obj);
    else
        return fail;
    fi;
end;

# Local assignment and condition diagnostics.
badLocal := function(flag)
    local value;
    if flag then
        value := 1;
    fi;
    return value; # diagnostic: may be read before assignment
end;

badCondition := function()
    if 3 then
        return 1;
    fi;
end;





