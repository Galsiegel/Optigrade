"init variables"
# init done[cid] = 1 - to all courses user already did
# init want_to_do[cid] <= 1 - to all courses he wants to do, but if it is already in done, dont add it.
# init wont_do[cid] = 0 to all courses wont do
"constrain 0 "
# done[cid1] <= x[cid1]
# want_to_do[cid1] <= x[cid1]
# x[cid1] <= wont_do[cid1]
# Maybe better:
# If user passed it: x[cid] = model.NewConstant(1)

#If user banned it: x[cid] = model.NewConstant(0)

# Else: x[cid] = model.NewBoolVar(...)




# extract from degree + user input:
# min points of mandatory courses, of MALAG and of sports.

# what group am I?

"constraint 1, dont count course twice"
# buckets_var[course_id][all_buckets]
# for each course id, sum on all buckets <=1

"constraint 2"
# sum on MALAG col >= (value given from user and degree) - is measured by points
# sum on Mmandatory col >= (value given from user and degree)- is measured by points
# sum on sports col >= (value given from user and degree)- is measured by points
# sum on courses from colums ( mandatory + Free_chice + core + specialties) >= (value from user/degree)- is measured by points
# sum on courses from core >= (value from degree) - measured in courses
# sum on courses from specialties col >= (val from degree) - measured in courses

"constraint 3"
# sum on allowed specialties == (value from user, usually 2 or 3)

"constraint 4"
# For each of chosen specialties, make sure the courses that are must know, are marked in any of the buckets (doesnt have to be in specialty)

#forcing connection between constraint and optimization
"constraint 5"
# alloc[cid][b] <= x[cid]
"target function"
# minimize vars sum on credits*x[cid] , return top 2

