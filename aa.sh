#!/usr/bin/env bash
set -euo pipefail

PS3="Choose an option: "
options=("Test" "Lint" "Format" "Quit")
select opt in "${options[@]}"
do
    case $opt in
        "Test") npx tsx --test;;
        "Lint") npm run lint;;
        "Format") npm run fmt;;
        "Quit") break;;
        *) echo "Invalid option $REPLY";;
    esac
done

